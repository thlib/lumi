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
const optionNames = Object.keys(eventOptions)

/**
 * Native event types that normally do not bubble. Lumi never rewrites an
 * event type and never silently changes where a listener is installed, so
 * this list only powers a development diagnostic. Custom events may reuse any
 * of these type strings with their own bubbles value.
 *
 * @type {ReadonlySet<string>}
 */
const nonBubblingEventTypes = new Set(
  ('abort beforetoggle blur canplay canplaythrough durationchange emptied '
    + 'ended error focus invalid load loadeddata loadedmetadata loadstart '
    + 'mouseenter mouseleave pause play playing pointerenter pointerleave '
    + 'progress ratechange resize scroll seeked seeking stalled suspend '
    + 'timeupdate toggle unload volumechange waiting').split(' '),
)

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
 * @throws {TypeError} When the declaration is not a valid event binding.
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
  // The one target of each component listener.
  /** @type {ReadonlySet<EventTarget>} */
  const componentTargets = new Set([root])

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

  // Component listeners are installed before element listeners.
  const groups = [...groupsByKey.values()].sort((left, right) => {
    return +(left.descriptor.at === 'elements')
      - +(right.descriptor.at === 'elements')
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

      try {
        descriptor.handle(nativeEvent, element)
      } catch (error) {
        // Native listener error behavior applies to element attachment.
        if (!isRouted) {
          throw error
        }

        // Native dispatch reports a listener exception without stopping the
        // remaining listeners. A shared listener preserves that isolation.
        reportEventError(root, error)
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
   * Keeps managed listeners aligned with the committed DOM. Reconciliation
   * runs after mount and after every successful commit.
   */
  function reconcile() {
    if (!isConnected) {
      return
    }

    for (const group of groups) {
      // A consumed group released its listeners and receives no new ones.
      if (!isActive(group)) {
        continue
      }

      const { type, capture, passive, at, selector } = group.descriptor
      const current = group.targets
      // A component listener stays on the component root. An event from a
      // shadow tree reaches the root only when the event is composed.
      const next = at === 'elements'
        ? new Set(queryOwnedElements(root, selector, ownedSubtrees))
        : componentTargets

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

  reconcile()

  return {
    prepare() {
      // Event declarations project no data. Listener membership follows the
      // committed DOM, so a failed preparation cannot change it.
      return { commit: reconcile }
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
 * Reports a routed handler exception the way an uncaught event-handler error
 * is reported, without letting it abort unrelated handlers.
 *
 * @param {Element} root
 * @param {unknown} error
 */
function reportEventError(root, error) {
  const view = /** @type {any} */ (root.ownerDocument.defaultView)

  if (typeof view?.reportError === 'function') {
    view.reportError(error)
    return
  }

  /** @type {unknown} */
  const schedule = view === null ? globalThis.setTimeout : view.setTimeout

  if (typeof schedule === 'function') {
    schedule(() => {
      throw error
    })
    return
  }

  console.error(error)
}

/**
 * Validates one event declaration.
 *
 * @param {string} selector
 * @param {string} type
 * @param {unknown} handler
 * @param {unknown} options
 * @returns {EventBindingDescriptor}
 */
function createEventDescriptor(selector, type, handler, options = {}) {
  if (typeof selector !== 'string' || selector.trim().length === 0) {
    throw new TypeError(
      'Lumi event binding selector must be a non-empty string',
    )
  }

  if (typeof type !== 'string' || type.length === 0) {
    throw new TypeError(
      `Lumi event binding on "${selector}" requires a non-empty event type`,
    )
  }

  /** @param {string} reason */
  const invalid = reason => {
    return new TypeError(
      `Invalid Lumi event binding for "${type}" on "${selector}": ${reason}`,
    )
  }

  /**
   * @param {ReadonlyArray<string>} values
   * @returns {string} The quoted values, for example `"a", "b" or "c"`.
   */
  const list = values => {
    return values
      .map(value => `"${value}"`)
      .join(', ')
      .replace(/, (?=[^,]*$)/, ' or ')
  }

  if (typeof handler !== 'function') {
    throw invalid('handler must be a function')
  }

  if (
    typeof options !== 'object'
    || options === null
    || Array.isArray(options)
  ) {
    throw invalid('options must be an object')
  }

  for (const name of Object.keys(options)) {
    if (!optionNames.includes(name)) {
      // The native listener option is the likeliest mistake, so name its
      // replacement instead of only listing the supported options.
      throw invalid(
        name === 'once'
          ? 'options.once is not a supported event option; '
            + 'use freq: "once" for a binding-level once'
          : `options.${name} is not a supported event option; `
            + `use ${list(optionNames)}`,
      )
    }
  }

  /** @type {Record<string, unknown>} */
  const descriptor = { type, selector, handle: handler }

  for (const name of optionNames) {
    const allowed = eventOptions[name] ?? null
    const value = /** @type {Record<string, unknown>} */ (options)[name]

    if (value === undefined) {
      descriptor[name] = allowed === null ? false : allowed[0]
    } else if (
      allowed === null
        ? typeof value === 'boolean'
        : allowed.includes(/** @type {string} */ (value))
    ) {
      descriptor[name] = value
    } else {
      throw invalid(
        `options.${name} must be `
        + (allowed === null ? 'a boolean' : list(allowed)),
      )
    }
  }

  // A well-known native event type that does not bubble normally cannot
  // reach a component listener. This stays a warning because a custom event
  // may reuse any type string and choose its own bubbles value.
  if (
    descriptor.at === 'component'
    && !descriptor.capture
    && nonBubblingEventTypes.has(type)
  ) {
    warn(
      `Lumi component event "${type}" normally does not bubble.\n`
      + '\nUse:\n'
      + '  {at: "elements"}\n'
      + 'for native listeners on matching elements, or:\n'
      + '  {capture: true}\n'
      + 'for intentional component capture.',
    )
  }

  return /** @type {EventBindingDescriptor} */ (
    /** @type {unknown} */ (Object.freeze(descriptor))
  )
}
