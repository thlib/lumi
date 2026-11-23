// @ts-check

import { cloneSourceRoot } from './dom.js'
import { connectEventBindings, getEventBindingDescriptor } from './events.js'
import {DEV} from './internal/dev.js'
import {fail} from './internal/fail.js'
import {
  connectDomBindings,
  flattenDomBindingDescriptors,
  getDomBindingDescriptor,
  ownedDomSubtrees,
} from './plan.js'

/**
 * Internal preparation entry points for mounted components. Keeping these in
 * a WeakMap lets nested bindings prepare child updates without adding a
 * method to Lumi's public mounted-component contract.
 *
 * @type {WeakMap<object, (data: unknown) => import('./types.js').PreparedUpdate>}
 */
const prepareByMounted = new WeakMap()

/**
 * Prepares one nested component update without committing its DOM writes.
 *
 * This is an internal renderer operation and is intentionally not exported
 * from the package entry point.
 *
 * @internal
 * @template Data
 * @param {import('./types.js').MountedComponent<Data>} mounted
 * @param {Data} data
 * @returns {import('./types.js').PreparedUpdate}
 */
export function prepareMounted(mounted, data) {
  const prepare = prepareByMounted.get(mounted)

  if (DEV && prepare === undefined) {
    fail(24)
  }

  return /** @type {(data: unknown) => import('./types.js').PreparedUpdate} */ (
    prepare
  )(data)
}

/**
 * Defines a reusable component without changing its source.
 *
 * @template Data
 * @param {import('./types.js').ComponentOptions<Data>} options
 * @returns {import('./types.js').Component<Data>}
 */
export function component(options) {
  const bindings = options.bindings ?? []

  return Object.freeze({
    mount(target) {
      if (DEV && target?.nodeType !== 1 && target?.nodeType !== 11) {
        fail(20)
      }

      const container = /** @type {Element | DocumentFragment} */ (target)
      const root = cloneSourceRoot(options.source)
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
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<import('./types.js').Binding<Data>>} bindings
 * @returns {import('./types.js').MountedComponent<Data>}
 */
function connectComponent(root, bindings) {
  let isRendering = false

  /** @type {Array<import('./types.js').ConnectedBinding<Data>>} */
  const connected = []
  /** @type {Array<import('./plan.js').DomBindingDescriptor<Data>>} */
  const domBindings = []
  /** @type {number | undefined} */
  let domBindingIndex
  /** @type {Array<import('./events.js').EventBindingDescriptor>} */
  const eventBindings = []
  /** @type {Element[]} */
  const ownedSubtrees = []
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
        const connectedBinding = binding.connect(root)
        connected.push(connectedBinding)
        ownedSubtrees.push(
          .../** @type {{[ownedDomSubtrees]?: Element[]}} */ (
            connectedBinding
          )[ownedDomSubtrees] ?? [],
        )
      }
    }

    if (domBindingIndex !== undefined) {
      connected.splice(
        domBindingIndex,
        0,
        connectDomBindings(
          root,
          flattenDomBindingDescriptors(domBindings),
          ownedSubtrees,
        ),
      )
    }

    if (eventBindings.length > 0) {
      // Managed listeners follow the committed DOM, so the event manager
      // commits last and releases its listeners first on unmount.
      connected.push(
        connectEventBindings(root, eventBindings, ownedSubtrees),
      )
    }
    isConnected = true
  } finally {
    if (!isConnected) {
      destroyConnected(connected)
    }
  }

  const mounted = {
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

  prepareByMounted.set(
    mounted,
    data => prepare(/** @type {Data} */ (data)),
  )

  return mounted
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
