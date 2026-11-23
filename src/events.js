// @ts-check

/**
 * Native DOM event registration, routing, and lifecycle management for
 * mounted components. The supported package surface is exported only from
 * index.js.
 *
 * @internal
 */

import {
  isInsideOwnedSubtree,
  queryElements,
  queryOwnedElements,
} from './dom.js'
import {DEV} from './internal/dev.js'
import {warn} from './internal/diagnostics.js'

const eventBindingDescriptor = Symbol('Lumi event binding descriptor')

/**
 * The supported event options. A list holds the allowed values, and its first
 * value is the default. A null option is a boolean, and its default is false.
 *
 * @type {Readonly<Record<string, ReadonlyArray<string> | null>>}
 */
const eventOptions = {
  at: ['component', 'elements'],
  capture: null,
  passive: null,
  freq: ['always', 'once'],
}

/**
 * Native event types that normally do not bubble. Lumi never rewrites an
 * event type and never silently changes where a listener is installed, so
 * this list only powers a development diagnostic. Custom events may reuse any
 * of these type strings with their own bubbles value.
 *
 * The list starts and ends with a space, so a search for a type between
 * two spaces finds only a complete type.
 */
const nonBubblingEventTypes = ' abort beforetoggle blur canplay '
  + 'canplaythrough durationchange emptied ended error focus invalid load '
  + 'loadeddata loadedmetadata loadstart mouseenter mouseleave pause play '
  + 'playing pointerenter pointerleave progress ratechange resize scroll '
  + 'seeked seeking stalled suspend timeupdate toggle unload volumechange '
  + 'waiting '

/**
 * One validated event declaration. Descriptors belong to the declaration, not
 * to a mount, so the same binding may be reused by several components.
 *
 * @typedef {object} EventBindingDescriptor
 * @property {string} type
 * @property {string} selector
 * @property {(event: Event, element: Element) => void} handle
 * @property {import('./types.js').EventBindingLocation} at
 * @property {boolean} capture
 * @property {boolean} passive
 * @property {import('./types.js').EventBindingFrequency} freq
 */

/**
 * Per-mount state for one declaration, including its once lifetime.
 *
 * @typedef {object} EventRuntime
 * @property {EventBindingDescriptor} descriptor
 * @property {boolean} isActive
 */

/**
 * One managed native listener and the targets that hold it. Component
 * declarations with the same type, capture phase, and passive declaration
 * share one group, whose one target is the component root.
 * Each element declaration has its own group, whose targets are the
 * matching elements. All declarations of a group have the same `at`, `type`,
 * `capture`, and `passive` values as `descriptor`.
 *
 * @typedef {object} ListenerGroup
 * @property {EventBindingDescriptor} descriptor
 * @property {EventRuntime[]} runtimes
 * @property {Set<EventTarget>} targets
 * @property {(event: Event) => void} listen
 */

/**
 * @template {string} Selector
 * @typedef {import('./types.js').SelectorElement<Selector>} SelectorElement
 */

/**
 * @template {string} Type
 * @typedef {import('./types.js').NativeEvent<Type>} NativeEvent
 */

/**
 * Declares one native event relationship inside Lumi-owned DOM.
 *
 * By default the event is routed through a listener on the component root, so
 * one managed listener keeps covering matching elements created, repeated, or
 * moved by later updates. `{at: 'elements'}` instead maintains native
 * listeners on every matching element, which is what non-bubbling events and
 * exact target-listener semantics require.
 *
 * The handler receives the original native event and the matched element.
 * Lumi does not synthesize events, translate event types, cancel default
 * actions, or trigger rendering; the handler owns the resulting decision and
 * any later call to `update()`.
 *
 * The selector comes first, like every other Lumi binding: each declaration
 * names the DOM it owns before what it does with it.
 *
 * @template {string} Selector
 * @template {string} Type
 * @template Data
 * @param {Selector} selector
 * @param {Type} type
 * @param {(event: NativeEvent<Type>, element: SelectorElement<Selector>) => void} handler
 * @param {import('./types.js').EventBindingOptions} [options]
 * @returns {import('./types.js').Binding<Data>}
 */
export function on(selector, type, handler, options) {
  const descriptor = createEventDescriptor(selector, type, handler, options)

  const binding = {
    [eventBindingDescriptor]: descriptor,

    connect(/** @type {Element} */ root) {
      return connectEventBindings(root, [descriptor])
    },
  }

  return /** @type {import('./types.js').Binding<Data>} */ (binding)
}

/**
 * Returns Lumi's internal descriptor for an event declaration.
 *
 * @template Data
 * @param {import('./types.js').Binding<Data>} binding
 * @returns {EventBindingDescriptor | null}
 */
export function getEventBindingDescriptor(binding) {
  return /** @type {any} */ (binding)?.[eventBindingDescriptor] ?? null
}

/**
 * Connects every event declaration of one component to its managed listeners.
 *
 * Compatible component declarations share one native listener on the
 * component root. Element declarations maintain native listeners that follow
 * their matching elements through the rendering lifecycle.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<EventBindingDescriptor>} descriptors
 * @param {ReadonlyArray<Element>} [ownedSubtrees]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function connectEventBindings(root, descriptors, ownedSubtrees = []) {
  let isConnected = true
  /** @type {Map<unknown, ListenerGroup>} */
  const groupsByKey = new Map()

  for (const descriptor of descriptors) {
    // Validate every selector while connecting, including when it currently
    // has no matches, so an invalid declaration fails mount atomically.
    queryElements(root, descriptor.selector)

    /** @type {EventRuntime} */
    const runtime = { descriptor, isActive: true }
    // freq is binding state rather than part of the grouping key. The
    // listener flags lead so that an arbitrary event type string cannot
    // shift one field into another.
    const key = descriptor.at === 'elements'
      ? runtime
      : `${+descriptor.capture}${+descriptor.passive} ${descriptor.type}`
    let group = groupsByKey.get(key)

    if (group === undefined) {
      /** @type {ListenerGroup} */
      const created = {
        descriptor,
        runtimes: [],
        targets: new Set(),
        listen: nativeEvent => {
          dispatch(created, nativeEvent)
        },
      }
      group = created
      groupsByKey.set(key, group)
    }

    group.runtimes.push(runtime)
  }

  const groups = [...groupsByKey.values()]
  // Only the listeners on matching elements follow the committed DOM.
  const elementGroups = groups.filter(group => {
    return group.descriptor.at === 'elements'
  })

  /**
   * @param {ListenerGroup} group
   * @param {Event} nativeEvent
   */
  function dispatch(group, nativeEvent) {
    const isRouted = group.descriptor.at === 'component'
    const path = isRouted
      ? componentPath(nativeEvent, root, ownedSubtrees)
      : []

    for (const runtime of group.runtimes) {
      // A handler may have unmounted this component.
      if (!isConnected) {
        return
      }

      if (!runtime.isActive) {
        continue
      }

      const descriptor = runtime.descriptor
      const element = isRouted
        ? path.find(candidate => candidate.matches(descriptor.selector))
        : /** @type {Element} */ (nativeEvent.currentTarget)

      if (element === undefined) {
        continue
      }

      if (descriptor.freq === 'once') {
        // A consumed binding leaves the listeners that other declarations
        // of its group use.
        runtime.isActive = false

        if (!isActive(group)) {
          detach(group)
        }
      }

      if (isRouted) {
        // Native dispatch reports a listener exception and continues with
        // the remaining listeners. A shared listener does the same.
        try {
          descriptor.handle(nativeEvent, element)
        } catch (error) {
          (root.ownerDocument.defaultView ?? globalThis).reportError(error)
        }
      } else {
        // A listener on the element has the native error behavior.
        descriptor.handle(nativeEvent, element)
      }
    }
  }

  /** @param {ListenerGroup} group */
  function isActive(group) {
    return group.runtimes.some(runtime => runtime.isActive)
  }

  /** @param {ListenerGroup} group */
  function detach(group) {
    const { type, capture } = group.descriptor

    for (const target of group.targets) {
      target.removeEventListener(type, group.listen, { capture })
    }
    group.targets.clear()
  }

  /**
   * Keeps the listeners on matching elements aligned with the committed DOM.
   * Reconciliation runs after mount and after every successful commit.
   */
  function reconcile() {
    if (!isConnected) {
      return
    }

    for (const group of elementGroups) {
      // A consumed group released its listeners and receives no new ones.
      if (!isActive(group)) {
        continue
      }

      const { type, capture, passive, selector } = group.descriptor
      const current = group.targets
      /** @type {Set<EventTarget>} */
      const next = new Set(queryOwnedElements(root, selector, ownedSubtrees))

      for (const target of current) {
        if (!next.has(target)) {
          target.removeEventListener(type, group.listen, { capture })
          current.delete(target)
        }
      }

      for (const target of next) {
        if (!current.has(target)) {
          target.addEventListener(type, group.listen, { capture, passive })
          current.add(target)
        }
      }
    }
  }

  // A component listener stays on the component root for its lifetime, so
  // an update does no work for it. An event from a shadow tree reaches the
  // root only when the event is composed. Component listeners are installed
  // before element listeners.
  for (const group of groups) {
    const { type, capture, passive, at } = group.descriptor

    if (at === 'component') {
      root.addEventListener(type, group.listen, { capture, passive })
      group.targets.add(root)
    }
  }

  reconcile()

  // Event declarations project no data. Listener membership follows the
  // committed DOM, so a failed preparation cannot change it.
  const prepared = { commit: reconcile }

  return {
    prepare() {
      return prepared
    },

    destroy() {
      isConnected = false
      groups.forEach(detach)
    },
  }
}

/**
 * Restricts a native event path to the elements owned by one component,
 * nearest target first. DOM owned internally by a nested Lumi component is
 * excluded; the child's own mount container is not. The contents of a shadow
 * root are excluded also: they belong to the element that attached it.
 *
 * @param {Event} nativeEvent
 * @param {Element} root
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
function componentPath(nativeEvent, root, ownedSubtrees) {
  /** @type {Element[]} */
  const path = []
  // Whether the event started in a shadow tree below the component root.
  let crossesShadowRoot = false

  for (const target of nativeEvent.composedPath()) {
    const node = /** @type {Element} */ (target)

    if (node === root) {
      // The component root participates in selector matching, and no
      // target after it belongs to the component.
      path.push(root)
      break
    }

    if (node.nodeType === 11) {
      // Only a shadow root is a fragment between an event target and the
      // component root.
      crossesShadowRoot = true
    } else if (
      node.nodeType === 1
      && !isInsideOwnedSubtree(node, ownedSubtrees)
    ) {
      path.push(node)
    }
  }

  // An open shadow root shows its contents in the path. Keep the elements
  // of the component tree: the hosts, their ancestors, and slotted content.
  return crossesShadowRoot
    ? path.filter(node => root.contains(node))
    : path
}

/**
 * Makes the descriptor of one event declaration. An option that is absent
 * or not valid gets its default value.
 *
 * The development version gives a warning for each part of a declaration
 * that is not valid.
 *
 * @param {string} selector
 * @param {string} type
 * @param {unknown} handler
 * @param {any} options
 * @returns {EventBindingDescriptor}
 */
function createEventDescriptor(selector, type, handler, options) {
  const at = options?.at === 'elements' ? 'elements' : 'component'
  const capture = !!options?.capture

  if (DEV) {
    /** @param {string} problem */
    const invalid = problem => warn(`on "${selector}" "${type}": ${problem}`)

    if (typeof selector !== 'string' || selector.trim() === '') {
      invalid('the selector must be a string that is not empty.')
    }

    if (typeof type !== 'string' || type === '') {
      invalid('the event type must be a string that is not empty.')
    }

    if (typeof handler !== 'function') {
      invalid('the handler must be a function.')
    }

    const isObject = typeof options === 'object' && options !== null

    if (options !== undefined && !isObject) {
      invalid('the options must be an object. They have no effect.')
    }

    for (const [name, value] of Object.entries(isObject ? options : {})) {
      const allowed = eventOptions[name]

      if (allowed === undefined) {
        invalid(
          `the option "${name}" is not known and has no effect.`
          + (name === 'once' ? ' Use freq: "once".' : ''),
        )
      } else if (
        value !== undefined
        && (
          allowed === null
            ? typeof value !== 'boolean'
            : !allowed.includes(value)
        )
      ) {
        invalid(
          `the option "${name}" must be `
          + (allowed === null ? 'a boolean' : `"${allowed.join('" or "')}"`)
          + '.',
        )
      }
    }

    // A well-known native event type that does not bubble cannot reach a
    // component listener. A custom event can use any type string and
    // select its own bubbles value, so this is not an error.
    if (
      at === 'component'
      && !capture
      && nonBubblingEventTypes.includes(` ${type} `)
    ) {
      invalid(
        'this event type usually does not bubble. Use {at: "elements"} for '
        + 'listeners on the matching elements, or {capture: true} for a '
        + 'capture listener on the component.',
      )
    }
  }

  return Object.freeze({
    type,
    selector,
    handle: /** @type {EventBindingDescriptor['handle']} */ (handler),
    at,
    capture,
    passive: !!options?.passive,
    freq: options?.freq === 'once' ? 'once' : 'always',
  })
}
