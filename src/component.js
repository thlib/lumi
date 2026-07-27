// @ts-check

import { assertElement, cloneTemplateRoot, findElement } from './dom.js'
import { connectEventBindings, getEventBindingDescriptor } from './events.js'
import {
  connectDomBindings,
  flattenDomBindingDescriptors,
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
 * Package-internal mount entry points. Application-level planners can use
 * these to declare component-owned member slots before bindings connect,
 * without widening the public Component contract.
 *
 * @type {WeakMap<object, (
 *   target: Element | null,
 *   boundarySelectors: ReadonlyArray<string>,
 * ) => {
 *   mounted: import('./types.js').MountedComponent<unknown>,
 *   boundaries: ReadonlyArray<Element>,
 * }>}
 */
const mountByComponent = new WeakMap()

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
 * Mounts a component while reserving selected containers for independently
 * planned component groups. The reserved containers receive the same DOM and
 * event ownership boundaries as child bindings, but their member lifecycle is
 * owned by the calling planner.
 *
 * @internal
 * @template Data
 * @param {import('./types.js').Component<Data>} definition
 * @param {Element | null} target
 * @param {ReadonlyArray<string>} boundarySelectors
 * @returns {{
 *   mounted: import('./types.js').MountedComponent<Data>,
 *   boundaries: ReadonlyArray<Element>,
 * }}
 */
export function mountWithBoundaries(
  definition,
  target,
  boundarySelectors,
) {
  const mount = mountByComponent.get(definition)

  if (mount === undefined) {
    throw new TypeError('Expected a Lumi component definition')
  }

  const result = mount(target, boundarySelectors)
  return {
    mounted: /** @type {import('./types.js').MountedComponent<Data>} */ (
      result.mounted
    ),
    boundaries: result.boundaries,
  }
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

  /**
   * @param {Element | null} target
   * @param {ReadonlyArray<string>} boundarySelectors
   */
  function mount(target, boundarySelectors) {
    assertElement(target, 'mount target')
    const root = cloneTemplateRoot(options.template)
    const boundaries = boundarySelectors.map(selector => {
      return findElement(root, selector)
    })

    if (new Set(boundaries).size !== boundaries.length) {
      throw new Error('Lumi component group boundaries must be unique')
    }

    for (let index = 0; index < boundaries.length; index += 1) {
      if (boundaries[index]?.childElementCount !== 0) {
        throw new Error(
          `Lumi component group boundary "${boundarySelectors[index]}" `
          + 'must not contain an element',
        )
      }
    }

    const previousChildren = Array.from(target.childNodes)
    target.replaceChildren(root)

    try {
      return {
        mounted: connectComponent(root, bindings, boundaries),
        boundaries,
      }
    } catch (error) {
      target.replaceChildren(...previousChildren)
      throw error
    }
  }

  const definition = Object.freeze({
    /** @param {Element | null} target */
    mount(target) {
      return mount(target, []).mounted
    },
  })

  mountByComponent.set(
    definition,
    (target, boundarySelectors) => {
      const result = mount(target, boundarySelectors)
      return {
        mounted: /** @type {import('./types.js').MountedComponent<unknown>} */ (
          result.mounted
        ),
        boundaries: result.boundaries,
      }
    },
  )

  return definition
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<import('./types.js').Binding<Data>>} bindings
 * @param {ReadonlyArray<Element>} [groupBoundaries]
 * @returns {import('./types.js').MountedComponent<Data>}
 */
function connectComponent(root, bindings, groupBoundaries = []) {
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
  const ownedSubtrees = [...groupBoundaries]
  /** @type {Array<import('./types.js').PreparedUpdate>} */
  const prepared = []
  let isSettled = true

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
        }
      } catch (error) {
        isFaulted = true
        discardPrepared(prepared, commitIndex)
        throw error
      } finally {
        prepared.length = 0
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
        prepared.length = 0
        isSettled = true
        isRendering = false
      }
    },
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
    prepared.length = 0

    try {
      for (const binding of connected) {
        prepared.push(binding.prepare(data))
      }
    } catch (error) {
      discardPrepared(prepared)
      prepared.length = 0
      isSettled = true
      isRendering = false
      throw error
    }

    return preparedUpdate
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
        domBindings.push(...flattenDomBindingDescriptors([descriptor]))
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
          domBindings,
          ownedSubtrees,
          sharedShadowTopology === null
            ? undefined
            : roots => {
              sharedShadowTopology.roots = roots
            },
        ),
      )
    }

    if (eventBindings.length > 0) {
      // Managed listeners follow the committed DOM, so the event manager
      // commits last and releases its listeners first on unmount.
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
