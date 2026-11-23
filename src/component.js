// @ts-check

import { sourceRoot } from './dom.js'
import { connectEventBindings, getEventBindingDescriptor } from './events.js'
import {definitions} from './internal/definitions.js'
import {DEV} from './internal/dev.js'
import {fail} from './internal/fail.js'
import {
  connectDomBindings,
  flattenDomBindingDescriptors,
  getDomBindingDescriptor,
} from './plan.js'

/**
 * Defines a reusable component without changing its source.
 *
 * @template Data
 * @param {import('./types.js').ComponentOptions<Data>} options
 * @returns {import('./types.js').Component<Data>}
 */
export function component(options) {
  const bindings = options.bindings ?? []

  const definition = Object.freeze({
    /**
     * @param {Element | DocumentFragment | null} target
     * @returns {import('./types.js').MountedComponent<Data>}
     */
    mount(target) {
      if (DEV && target?.nodeType !== 1 && target?.nodeType !== 11) {
        fail(20)
      }

      const container = /** @type {Element | DocumentFragment} */ (target)
      const source = sourceRoot(options.source)
      const existing = container.firstElementChild

      // A target that has the root element of the component keeps it. The
      // first update then writes only the differences.
      if (existing !== source && existing?.localName === source.localName) {
        return connectComponent(existing, bindings, source)
      }

      const root = /** @type {Element} */ (source.cloneNode(true))
      const previousChildren = Array.from(container.childNodes)
      let mounted

      container.replaceChildren(root)

      // An error in a binding goes to the caller. The target then gets its
      // previous content again.
      try {
        return mounted = connectComponent(root, bindings)
      } finally {
        if (mounted === undefined) {
          container.replaceChildren(...previousChildren)
        }
      }
    },
  })

  definitions.set(definition, options)
  return definition
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<import('./types.js').Binding<Data>>} bindings
 * @param {Element | null} [source] The root element of the component
 * source, when `root` is an element that the target had.
 * @returns {import('./types.js').MountedComponent<Data>}
 */
function connectComponent(root, bindings, source = null) {
  let isRendering = false

  /** @type {Array<import('./types.js').ConnectedBinding<Data>>} */
  const connected = []
  /** @type {Array<import('./plan.js').DomBindingDescriptor<Data>>} */
  const domBindings = []
  /** @type {number | undefined} */
  let domBindingIndex
  /** @type {Array<import('./events.js').EventBindingDescriptor>} */
  const eventBindings = []
  // The containers of the child components, in the mounted DOM.
  /** @type {WeakSet<Element> | null} */
  let containers = null
  /** @type {Array<import('./types.js').PreparedUpdate>} */
  const prepared = []

  // An update is settled when it is committed or discarded.
  const settle = () => {
    prepared.length = 0
    isRendering = false
  }

  /**
   * A settled update has no prepared work, so a second commit or a discard
   * does nothing.
   *
   * @type {import('./types.js').PreparedUpdate}
   */
  const preparedUpdate = {
    commit() {
      let commitIndex = 0

      // An error in a commit goes to the caller. The prepared work that is
      // not committed is discarded.
      try {
        for (; commitIndex < prepared.length; commitIndex += 1) {
          prepared[commitIndex]?.commit()
        }
      } finally {
        discardPrepared(prepared, commitIndex)
        settle()
      }
    },

    discard() {
      discardPrepared(prepared)
      settle()
    },
  }

  /**
   * An unmounted component has no connected bindings, so its update does
   * nothing.
   *
   * @param {Data} data
   * @returns {import('./types.js').PreparedUpdate}
   */
  function prepare(data) {
    if (isRendering) {
      fail(13)
    }

    isRendering = true

    let isPrepared = false

    // An error in a projection goes to the caller, and the DOM stays as it
    // was.
    try {
      for (const binding of connected) {
        prepared.push(binding.prepare(data))
      }
      isPrepared = true
    } finally {
      if (!isPrepared) {
        discardPrepared(prepared)
        settle()
      }
    }

    return preparedUpdate
  }

  /** @param {Data} data */
  function update(data) {
    prepare(data).commit()
  }

  let isConnected = false

  try {
    for (const binding of bindings) {
      const eventDescriptor = getEventBindingDescriptor(binding)

      if (eventDescriptor !== null) {
        eventBindings.push(eventDescriptor)
        continue
      }

      const descriptor = getDomBindingDescriptor(binding)

      if (descriptor !== null) {
        domBindingIndex ??= connected.length
        domBindings.push(descriptor)
      } else {
        connected.push(binding.connect(root))
      }
    }

    if (domBindingIndex !== undefined) {
      const descriptors = flattenDomBindingDescriptors(domBindings)

      if (descriptors.some(descriptor => descriptor.kind === 'child')) {
        containers = new WeakSet()
      }

      connected.splice(
        domBindingIndex,
        0,
        connectDomBindings(root, descriptors, containers, source),
      )
    }

    if (eventBindings.length > 0) {
      // Managed listeners follow the committed DOM, so the event manager
      // commits last and releases its listeners first on unmount.
      connected.push(
        connectEventBindings(root, eventBindings, containers),
      )
    }
    isConnected = true
  } finally {
    if (!isConnected) {
      destroyConnected(connected)
    }
  }

  return {
    root,
    update,

    unmount() {
      if (isRendering) {
        fail(13)
      }

      // A second unmount finds no connected binding and no parent.
      try {
        destroyConnected(connected)
      } finally {
        root.remove()
      }
    },
  }
}

/**
 * Destroys the connected bindings in reverse order and empties the list.
 * When one binding gives an error, the remaining bindings are destroyed
 * before the error goes to the caller.
 *
 * @param {Array<{destroy: () => void}>} connected
 */
function destroyConnected(connected) {
  try {
    while (connected.length > 0) {
      connected.pop()?.destroy()
    }
  } finally {
    if (connected.length > 0) {
      destroyConnected(connected)
    }
  }
}

/**
 * Discards prepared work in reverse binding order.
 *
 * @param {ReadonlyArray<import('./types.js').PreparedUpdate>} prepared
 * @param {number} [start]
 */
function discardPrepared(prepared, start = 0) {
  for (let index = prepared.length - 1; index >= start; index -= 1) {
    prepared[index]?.discard?.()
  }
}
