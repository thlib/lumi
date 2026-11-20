// @ts-check

import { assertElement, cloneSourceRoot } from './dom.js'
import { connectEventBindings, getEventBindingDescriptor } from './events.js'
import {
  connectDomBindings,
  flattenDomBindingDescriptors,
  getDomBindingDescriptor,
  getOwnedDomSubtrees,
} from './plan.js'
import {
  SubscriberQueue,
  createHost,
  releaseSubscriber,
  scheduleHost,
  syncSubscriber,
  tracking,
} from './tracked.js'

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
      assertElement(target, 'mount target')
      const root = cloneSourceRoot(options.source)
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
  /** @type {Array<import('./types.js').PreparedUpdate>} */
  const prepared = []
  let isSettled = true

  // Tracked data. Each connected binding is one part that Lumi can prepare
  // again by itself. The DOM planner of a component with a repeat binding
  // also tracks smaller parts, and prepares those through `prepareChanged`.
  const host = createHost(refresh)
  const queue = new SubscriberQueue(() => scheduleHost(host))
  /** @type {Array<import('./tracked.js').Subscriber | null>} */
  const subscribers = []
  /**
   * For each prepared update, the index of its connected binding and the
   * tracked data that the preparation read. The index is -1 for a
   * preparation of changed parts, which records its own reads.
   *
   * @type {number[]}
   */
  const preparedBindings = []
  /** @type {Array<ReadonlyArray<import('./tracked.js').Dependency>>} */
  const preparedReads = []
  let hasData = false
  /** The data of the last committed update. */
  let currentData = /** @type {Data} */ (undefined)
  let preparedData = /** @type {Data} */ (undefined)
  let isCompleteUpdate = false
  let eventsIndex = -1
  let hasElementListeners = false

  function settle() {
    prepared.length = 0
    preparedBindings.length = 0
    preparedReads.length = 0
    isSettled = true
    isRendering = false
  }

  /** @type {import('./types.js').PreparedUpdate} */
  const preparedUpdate = {
    commit() {
      if (isSettled) {
        throw new Error('Cannot commit a settled Lumi update')
      }

      let commitIndex = 0

      try {
        for (; commitIndex < prepared.length; commitIndex += 1) {
          prepared[commitIndex]?.commit()

          const index = preparedBindings[commitIndex] ?? -1
          const reads = preparedReads[commitIndex]

          if (index !== -1 && reads !== undefined) {
            subscribers[index] = syncSubscriber(
              subscribers[index] ?? null,
              reads,
              0,
              reads.length,
              queue,
              index,
              0,
            )
          }
        }

        if (isCompleteUpdate) {
          currentData = preparedData
          hasData = true
        }
      } catch (error) {
        isFaulted = true
        discardPrepared(prepared, commitIndex)
        throw error
      } finally {
        settle()
      }
    },

    discard() {
      if (isSettled) {
        return
      }

      try {
        discardPrepared(prepared)
      } finally {
        settle()
      }
    },
  }

  /**
   * Prepares one connected binding and records the tracked data that its
   * projections read.
   *
   * @param {number} index
   * @param {Data} data
   */
  function prepareBinding(index, data) {
    const binding = /** @type {import('./types.js').ConnectedBinding<Data>} */ (
      connected[index]
    )
    const outerReads = tracking.reads
    /** @type {Array<import('./tracked.js').Dependency>} */
    const reads = []

    tracking.reads = reads

    try {
      prepared.push(binding.prepare(data))
    } finally {
      tracking.reads = outerReads
    }

    preparedBindings.push(index)
    preparedReads.push(reads)
  }

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
    isSettled = false
    isCompleteUpdate = true
    preparedData = data

    try {
      for (let index = 0; index < connected.length; index += 1) {
        prepareBinding(index, data)
      }
    } catch (error) {
      discardPrepared(prepared)
      settle()
      throw error
    }

    return preparedUpdate
  }

  /**
   * Applies the writes to tracked data since the last update. Only the parts
   * that read the written data are prepared and committed.
   *
   * @returns {boolean} False when the component cannot apply changes now.
   */
  function refresh() {
    if (!isMounted || isFaulted || !hasData) {
      return true
    }

    if (isRendering) {
      return false
    }

    isRendering = true
    isSettled = false
    isCompleteUpdate = false

    try {
      let needsEvents = hasElementListeners

      for (let index = 0; index < connected.length; index += 1) {
        if (index === eventsIndex) {
          continue
        }

        if (subscribers[index]?.isChanged === true) {
          prepareBinding(index, currentData)
          needsEvents = true
          continue
        }

        const change = connected[index]?.prepareChanged?.() ?? null

        if (change !== null) {
          prepared.push(change)
          preparedBindings.push(-1)
          preparedReads.push([])
          needsEvents ||= change.isStructural === true
        }
      }

      // Managed listeners follow the committed DOM. A change of text or of
      // one attribute cannot change the event boundaries. An element
      // listener can match a different set of elements after each change.
      if (prepared.length > 0 && eventsIndex !== -1 && needsEvents) {
        prepareBinding(eventsIndex, currentData)
      }
    } catch (error) {
      discardPrepared(prepared)
      settle()
      throw error
    }

    if (prepared.length === 0) {
      settle()
      return true
    }

    preparedUpdate.commit()
    return true
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

    /** @type {{roots: ReadonlySet<ShadowRoot> | null} | null} */
    const sharedShadowTopology = (
      eventBindings.length > 0
      && domBindingIndex !== undefined
      && domBindingIndex === connected.length
    )
      ? { roots: null }
      : null

    if (domBindingIndex !== undefined) {
      connected.splice(
        domBindingIndex,
        0,
        connectDomBindings(
          root,
          flattenDomBindingDescriptors(domBindings),
          ownedSubtrees,
          sharedShadowTopology === null
            ? undefined
            : roots => {
              sharedShadowTopology.roots = roots
            },
          queue.schedule,
        ),
      )
    }

    if (eventBindings.length > 0) {
      // Managed listeners follow the committed DOM, so the event manager
      // commits last and releases its listeners first on unmount.
      eventsIndex = connected.length
      hasElementListeners = eventBindings.some(descriptor => {
        return descriptor.at === 'elements'
      })
      connected.push(connectEventBindings(
        root,
        eventBindings,
        ownedSubtrees,
        sharedShadowTopology === null
          ? undefined
          : () => {
            const roots = sharedShadowTopology.roots
            sharedShadowTopology.roots = null
            return roots
          },
      ))
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

      for (const subscriber of subscribers) {
        releaseSubscriber(subscriber ?? null)
      }

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
