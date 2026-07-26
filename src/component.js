// @ts-check

import { assertElement, cloneTemplateRoot } from './dom.js'
import { connectEventBindings, getEventBindingDescriptor } from './events.js'
import {
  connectDomBindings,
  getDomBindingDescriptor,
  getOwnedDomSubtrees,
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

  if (prepare === undefined) {
    throw new TypeError('Expected a mounted Lumi component')
  }

  return prepare(data)
}

/**
 * Defines a reusable component without changing its template.
 *
 * @template Data
 * @param {import('./types.js').ComponentOptions<Data>} options
 * @returns {import('./types.js').Component<Data>}
 */
export function component(options) {
  const bindings = options.bindings ?? []

  return Object.freeze({
    mount(target) {
      assertElement(target, 'mount target')
      const root = cloneTemplateRoot(options.template)
      const previousChildren = Array.from(target.childNodes)
      target.replaceChildren(root)

      try {
        return connectComponent(root, bindings)
      } catch (error) {
        target.replaceChildren(...previousChildren)
        throw error
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
  let isMounted = true
  let isRendering = false
  let isFaulted = false

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

  /**
   * @param {Data} data
   * @returns {import('./types.js').PreparedUpdate}
   */
  function prepare(data) {
    if (!isMounted) {
      throw new Error('Cannot update an unmounted Lumi component')
    }

    if (isFaulted) {
      throw new Error(
        'Cannot update a faulted Lumi component; unmount it and mount again',
      )
    }

    if (isRendering) {
      throw new Error('Cannot update a Lumi component recursively')
    }

    isRendering = true
    /** @type {import('./types.js').PreparedUpdate[]} */
    const prepared = []

    try {
      for (const binding of connected) {
        prepared.push(binding.prepare(data))
      }
    } catch (error) {
      discardPrepared(prepared)
      isRendering = false
      throw error
    }

    let isSettled = false

    return {
      commit() {
        if (isSettled) {
          throw new Error('Cannot commit a settled Lumi update')
        }

        let commitIndex = 0

        try {
          for (; commitIndex < prepared.length; commitIndex += 1) {
            prepared[commitIndex]?.commit()
          }
        } catch (error) {
          isFaulted = true
          discardPrepared(prepared, commitIndex)
          throw error
        } finally {
          isSettled = true
          isRendering = false
        }
      },

      discard() {
        if (isSettled) {
          return
        }

        try {
          discardPrepared(prepared)
        } finally {
          isSettled = true
          isRendering = false
        }
      },
    }
  }

  /** @param {Data} data */
  function update(data) {
    prepare(data).commit()
  }

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
        ownedSubtrees.push(...getOwnedDomSubtrees(connectedBinding))
      }
    }

    if (domBindingIndex !== undefined) {
      connected.splice(
        domBindingIndex,
        0,
        connectDomBindings(root, domBindings, ownedSubtrees),
      )
    }

    if (eventBindings.length > 0) {
      // Managed listeners follow the committed DOM, so the event manager
      // commits last and releases its listeners first on unmount.
      connected.push(connectEventBindings(root, eventBindings, ownedSubtrees))
    }
  } catch (error) {
    destroyConnected(connected)
    throw error
  }

  const mounted = {
    root,
    update,

    unmount() {
      if (!isMounted) {
        return
      }

      if (isRendering) {
        throw new Error('Cannot unmount a Lumi component during an update')
      }

      const cleanupError = destroyConnected(connected)

      try {
        root.remove()
      } finally {
        isMounted = false
      }

      if (cleanupError !== undefined) {
        throw cleanupError
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
 * Destroys every connected binding even when one cleanup operation fails.
 * The first failure is returned after all bindings have had a chance to clean
 * up.
 *
 * @param {ReadonlyArray<{destroy: () => void}>} connected
 * @returns {unknown}
 */
function destroyConnected(connected) {
  /** @type {unknown} */
  let firstError

  for (let index = connected.length - 1; index >= 0; index -= 1) {
    try {
      connected[index]?.destroy()
    } catch (error) {
      firstError ??= error
    }
  }

  return firstError
}

/**
 * Discards prepared work in reverse binding order. Cleanup remains best-effort
 * so one failing discard cannot strand later prepared child components.
 *
 * @param {ReadonlyArray<import('./types.js').PreparedUpdate>} prepared
 * @param {number} [start]
 */
function discardPrepared(prepared, start = 0) {
  for (let index = prepared.length - 1; index >= start; index -= 1) {
    try {
      prepared[index]?.discard?.()
    } catch {
      // Preserve the projection or commit error that triggered cleanup.
    }
  }
}
