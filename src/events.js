// @ts-check

/**
 * Native DOM event registration, routing, and lifecycle management for
 * mounted components. The supported package surface is exported only from
 * index.js.
 *
 * @internal
 */

import {
  elementWalker,
  isInsideOwnedSubtree,
  queryElements,
  queryOwnedElements,
} from './dom.js'

const eventBindingDescriptor = Symbol('Lumi event binding descriptor')

/** @type {ReadonlyArray<import('./types.js').EventBindingLocation>} */
const eventLocations = ['component', 'elements']
/** @type {ReadonlyArray<import('./types.js').EventBindingFrequency>} */
const frequencies = ['always', 'once']
const optionNames = ['at', 'capture', 'passive', 'freq']

/**
 * Native event types that normally do not bubble. Lumi never rewrites an
 * event type and never silently changes where a listener is installed, so
 * this list only powers a development diagnostic. Custom events may reuse any
 * of these type strings with their own bubbles value.
 *
 * @type {ReadonlySet<string>}
 */
const nonBubblingEventTypes = new Set([
  'abort',
  'beforetoggle',
  'blur',
  'canplay',
  'canplaythrough',
  'durationchange',
  'emptied',
  'ended',
  'error',
  'focus',
  'invalid',
  'load',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'mouseenter',
  'mouseleave',
  'pause',
  'play',
  'playing',
  'pointerenter',
  'pointerleave',
  'progress',
  'ratechange',
  'resize',
  'scroll',
  'seeked',
  'seeking',
  'stalled',
  'suspend',
  'timeupdate',
  'toggle',
  'unload',
  'volumechange',
  'waiting',
])

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
 * @property {Set<Element>} elements
 * @property {((event: Event) => void) | null} listen
 * @property {EventRouter | null} router
 */

/**
 * One logical component router: an event boundary group sharing a type,
 * capture phase, and passive declaration.
 *
 * @typedef {object} EventRouter
 * @property {string} type
 * @property {boolean} capture
 * @property {boolean} passive
 * @property {EventRuntime[]} runtimes
 * @property {Set<EventTarget>} boundaries
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
 * By default the event is routed through component-owned event boundaries, so
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
  if (
    typeof binding !== 'object'
    || binding === null
    || !Reflect.has(binding, eventBindingDescriptor)
  ) {
    return null
  }

  return /** @type {EventBindingDescriptor} */ (
    Reflect.get(binding, eventBindingDescriptor)
  )
}

/**
 * Connects every event declaration of one component to its managed listeners.
 *
 * Compatible component declarations share one logical router per component
 * event boundary. Element declarations maintain native listeners that follow
 * their matching elements through the rendering lifecycle.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<EventBindingDescriptor>} descriptors
 * @param {ReadonlyArray<Element>} [ownedSubtrees]
 * @param {(() => ReadonlySet<ShadowRoot> | null)} [readShadowRoots]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function connectEventBindings(
  root,
  descriptors,
  ownedSubtrees = [],
  readShadowRoots,
) {
  let isConnected = true

  /** @type {EventRuntime[]} */
  const runtimes = descriptors.map(descriptor => ({
    descriptor,
    isActive: true,
    elements: new Set(),
    listen: null,
    router: null,
  }))

  // Validate every selector while connecting, including when it currently has
  // no matches, so an invalid declaration fails mount atomically.
  for (const runtime of runtimes) {
    queryElements(root, runtime.descriptor.selector)
  }

  const elementRuntimes = runtimes.filter(runtime => {
    return runtime.descriptor.at === 'elements'
  })
  const routers = createRouters(runtimes)
  /** @type {import('./types.js').PreparedUpdate} */
  const preparedReconciliation = { commit: reconcile }

  /**
   * A binding runs at most once per native event even when the event reaches
   * more than one component-owned routing boundary. Keying by the event keeps
   * that true for reentrant dispatch.
   *
   * @type {WeakMap<Event, Set<EventRuntime>>}
   */
  const invokedByEvent = new WeakMap()

  /**
   * @param {EventRouter} router
   * @param {Event} nativeEvent
   */
  function route(router, nativeEvent) {
    if (!isConnected) {
      return
    }

    let invoked = invokedByEvent.get(nativeEvent)

    if (invoked === undefined) {
      invoked = new Set()
      invokedByEvent.set(nativeEvent, invoked)
    }

    const path = componentPath(nativeEvent, root, ownedSubtrees)

    for (const runtime of router.runtimes) {
      // A handler may have unmounted this component.
      if (!isConnected) {
        return
      }

      if (!runtime.isActive || invoked.has(runtime)) {
        continue
      }

      const element = nearestMatch(path, runtime.descriptor.selector)

      if (element === null) {
        continue
      }

      invoked.add(runtime)

      if (runtime.descriptor.freq === 'once') {
        consume(runtime)
      }

      try {
        runtime.descriptor.handle(nativeEvent, element)
      } catch (error) {
        // Native dispatch reports a listener exception without stopping the
        // remaining listeners. A shared router preserves that isolation.
        reportEventError(root, error)
      }
    }
  }

  /**
   * @param {ReadonlyArray<EventRuntime>} allRuntimes
   * @returns {EventRouter[]}
   */
  function createRouters(allRuntimes) {
    /** @type {Map<string, EventRouter>} */
    const byKey = new Map()

    for (const runtime of allRuntimes) {
      const descriptor = runtime.descriptor

      if (descriptor.at !== 'component') {
        continue
      }

      // freq is binding state rather than part of the grouping key. The
      // listener flags lead so that an arbitrary event type string cannot
      // shift one field into another.
      const key = `${descriptor.capture ? 1 : 0}${descriptor.passive ? 1 : 0} `
        + descriptor.type
      let router = byKey.get(key)

      if (router === undefined) {
        /** @type {EventRouter} */
        const created = {
          type: descriptor.type,
          capture: descriptor.capture,
          passive: descriptor.passive,
          runtimes: [],
          boundaries: new Set(),
          listen: nativeEvent => {
            route(created, nativeEvent)
          },
        }
        router = created
        byKey.set(key, created)
      }

      router.runtimes.push(runtime)
      runtime.router = router
    }

    return Array.from(byKey.values())
  }

  /**
   * Consumes a once binding. Component routes are removed from their shared
   * router without disturbing routes owned by other declarations.
   *
   * @param {EventRuntime} runtime
   */
  function consume(runtime) {
    runtime.isActive = false

    if (runtime.descriptor.at === 'elements') {
      detachElementListeners(runtime)
      return
    }

    const router = runtime.router

    if (
      router !== null
      && !router.runtimes.some(other => other.isActive)
    ) {
      detachRouter(router)
    }
  }

  /** @param {EventRuntime} runtime */
  function elementListener(runtime) {
    runtime.listen ??= nativeEvent => {
      if (!isConnected || !runtime.isActive) {
        return
      }

      const element = /** @type {Element} */ (nativeEvent.currentTarget)

      if (runtime.descriptor.freq === 'once') {
        consume(runtime)
      }

      // Native listener error behavior applies to element attachment.
      runtime.descriptor.handle(nativeEvent, element)
    }

    return runtime.listen
  }

  /** @param {EventRuntime} runtime */
  function detachElementListeners(runtime) {
    const descriptor = runtime.descriptor

    for (const element of runtime.elements) {
      element.removeEventListener(
        descriptor.type,
        elementListener(runtime),
        { capture: descriptor.capture },
      )
    }

    runtime.elements.clear()
  }

  /** @param {EventRouter} router */
  function detachRouter(router) {
    for (const boundary of router.boundaries) {
      boundary.removeEventListener(router.type, router.listen, {
        capture: router.capture,
      })
    }

    router.boundaries.clear()
  }

  /**
   * Keeps managed listeners aligned with the committed DOM. Reconciliation
   * runs after mount and after every successful commit.
   */
  function reconcile() {
    if (!isConnected) {
      return
    }

    if (routers.length > 0) {
      reconcileRouters()
    }

    if (elementRuntimes.length > 0) {
      reconcileElements()
    }
  }

  function reconcileRouters() {
    const sharedShadowRoots = readShadowRoots?.() ?? null
    const boundaries = sharedShadowRoots === null
      ? collectEventBoundaries(root, ownedSubtrees)
      : eventBoundariesFromShadowRoots(
        root,
        sharedShadowRoots,
        ownedSubtrees,
      )

    for (const router of routers) {
      if (!router.runtimes.some(runtime => runtime.isActive)) {
        continue
      }

      for (const boundary of router.boundaries) {
        if (!boundaries.has(boundary)) {
          boundary.removeEventListener(router.type, router.listen, {
            capture: router.capture,
          })
          router.boundaries.delete(boundary)
        }
      }

      for (const boundary of boundaries) {
        if (router.boundaries.has(boundary)) {
          continue
        }

        boundary.addEventListener(router.type, router.listen, {
          capture: router.capture,
          passive: router.passive,
        })
        router.boundaries.add(boundary)
      }
    }
  }

  function reconcileElements() {
    for (const runtime of elementRuntimes) {
      // A consumed binding released its listeners and receives no new ones.
      if (!runtime.isActive) {
        continue
      }

      const descriptor = runtime.descriptor
      const matches = new Set(
        queryOwnedElements(root, descriptor.selector, ownedSubtrees),
      )

      for (const element of runtime.elements) {
        if (!matches.has(element)) {
          element.removeEventListener(
            descriptor.type,
            elementListener(runtime),
            { capture: descriptor.capture },
          )
          runtime.elements.delete(element)
        }
      }

      for (const element of matches) {
        if (runtime.elements.has(element)) {
          continue
        }

        element.addEventListener(
          descriptor.type,
          elementListener(runtime),
          { capture: descriptor.capture, passive: descriptor.passive },
        )
        runtime.elements.add(element)
      }
    }
  }

  reconcile()

  return {
    prepare() {
      // Event declarations project no data. Listener membership follows the
      // committed DOM, so a failed preparation cannot change it.
      return preparedReconciliation
    },

    destroy() {
      if (!isConnected) {
        return
      }

      isConnected = false

      for (const router of routers) {
        detachRouter(router)
      }

      for (const runtime of elementRuntimes) {
        detachElementListeners(runtime)
      }

      for (const runtime of runtimes) {
        runtime.isActive = false
        runtime.listen = null
        runtime.router = null
      }

      routers.length = 0
    },
  }
}

/**
 * Builds the component event-boundary set from topology already discovered by
 * the final DOM commit of the same synchronous update.
 *
 * @param {Element} root
 * @param {ReadonlySet<ShadowRoot>} shadowRoots
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Set<EventTarget>}
 */
function eventBoundariesFromShadowRoots(root, shadowRoots, ownedSubtrees) {
  /** @type {Set<EventTarget>} */
  const boundaries = new Set([root])

  for (const shadowRoot of shadowRoots) {
    if (!isInsideOwnedSubtree(shadowRoot.host, ownedSubtrees)) {
      boundaries.add(shadowRoot)
    }
  }

  return boundaries
}

/**
 * Restricts a native event path to the elements owned by one component,
 * nearest target first. DOM owned internally by a nested Lumi component is
 * excluded; the child's own mount container is not.
 *
 * @param {Event} nativeEvent
 * @param {Element} root
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
function componentPath(nativeEvent, root, ownedSubtrees) {
  /** @type {Element[]} */
  const path = []

  for (const target of nativeEvent.composedPath()) {
    if (
      typeof target !== 'object'
      || target === null
      || !('nodeType' in target)
    ) {
      // A Window ends the path outside every component.
      break
    }

    const node = /** @type {Node} */ (target)

    if (node === root) {
      // The component root participates in selector matching.
      path.push(root)
      break
    }

    if (node.nodeType === 9) {
      // A Document is reached only when the root is not on this path.
      break
    }

    if (node.nodeType !== 1) {
      // A ShadowRoot separates two element trees Lumi may both own.
      continue
    }

    const element = /** @type {Element} */ (node)

    if (!isInsideOwnedSubtree(element, ownedSubtrees)) {
      path.push(element)
    }
  }

  return path
}

/**
 * @param {ReadonlyArray<Element>} path
 * @param {string} selector
 * @returns {Element | null}
 */
function nearestMatch(path, selector) {
  for (const element of path) {
    if (element.matches(selector)) {
      return element
    }
  }

  return null
}

/**
 * Collects the event trees one component owns: its root tree plus every
 * reachable open shadow root inside its own DOM.
 *
 * @param {Element} root
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Set<EventTarget>}
 */
function collectEventBoundaries(root, ownedSubtrees) {
  /** @type {Set<EventTarget>} */
  const boundaries = new Set([root])
  collectShadowBoundaries(root, boundaries, ownedSubtrees)
  return boundaries
}

/**
 * @param {Element | ShadowRoot} scope
 * @param {Set<EventTarget>} boundaries
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function collectShadowBoundaries(scope, boundaries, ownedSubtrees) {
  if (scope.nodeType === 1) {
    collectShadowBoundary(
      /** @type {Element} */ (scope),
      boundaries,
      ownedSubtrees,
    )
  }

  // Native traversal keeps the common shadow-free component cheap; only a
  // discovered shadow root costs another pass.
  const walker = elementWalker(scope)

  while (walker.nextNode() !== null) {
    collectShadowBoundary(
      /** @type {Element} */ (walker.currentNode),
      boundaries,
      ownedSubtrees,
    )
  }
}

/**
 * @param {Element} element
 * @param {Set<EventTarget>} boundaries
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function collectShadowBoundary(element, boundaries, ownedSubtrees) {
  const shadowRoot = element.shadowRoot

  if (
    shadowRoot === null
    || isInsideOwnedSubtree(element, ownedSubtrees)
  ) {
    return
  }

  boundaries.add(shadowRoot)
  collectShadowBoundaries(shadowRoot, boundaries, ownedSubtrees)
}

/**
 * Reports a routed handler exception the way an uncaught event-handler error
 * is reported, without letting it abort unrelated handlers.
 *
 * @param {Element} root
 * @param {unknown} error
 */
function reportEventError(root, error) {
  const view = root.ownerDocument.defaultView

  if (view !== null) {
    const report = Reflect.get(view, 'reportError')

    if (typeof report === 'function') {
      Reflect.apply(report, view, [error])
      return
    }
  }

  const schedule = view === null
    ? globalThis.setTimeout
    : /** @type {typeof globalThis.setTimeout} */ (
      Reflect.get(view, 'setTimeout')
    )

  if (typeof schedule === 'function') {
    schedule(() => {
      throw error
    })
    return
  }

  console.error(error)
}

/**
 * @param {string} selector
 * @param {string} type
 * @param {unknown} handler
 * @param {unknown} options
 * @returns {EventBindingDescriptor}
 */
function createEventDescriptor(selector, type, handler, options) {
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

  if (typeof handler !== 'function') {
    throw invalidEventBinding(type, selector, 'handler must be a function')
  }

  const settings = readEventOptions(type, selector, options)
  const descriptor = Object.freeze({
    type,
    selector,
    handle: /** @type {(event: Event, element: Element) => void} */ (handler),
    ...settings,
  })

  warnAboutNonBubblingComponentEvent(descriptor)

  return descriptor
}

/**
 * @param {string} type
 * @param {string} selector
 * @param {unknown} options
 * @returns {{
 *   at: import('./types.js').EventBindingLocation,
 *   capture: boolean,
 *   passive: boolean,
 *   freq: import('./types.js').EventBindingFrequency,
 * }}
 */
function readEventOptions(type, selector, options) {
  if (options === undefined) {
    return {
      at: 'component',
      capture: false,
      passive: false,
      freq: 'always',
    }
  }

  if (
    typeof options !== 'object'
    || options === null
    || Array.isArray(options)
  ) {
    throw invalidEventBinding(type, selector, 'options must be an object')
  }

  for (const name of Object.keys(options)) {
    if (optionNames.includes(name)) {
      continue
    }

    // The native listener option is the likeliest mistake, so name its
    // replacement instead of only listing the supported options.
    throw invalidEventBinding(
      type,
      selector,
      name === 'once'
        ? 'options.once is not a supported event option; '
          + 'use freq: "once" for a binding-level once'
        : `options.${name} is not a supported event option; `
          + `use ${listValues(optionNames)}`,
    )
  }

  return {
    at: readEnumOption(type, selector, options, 'at', eventLocations, 'component'),
    capture: readBooleanOption(type, selector, options, 'capture'),
    passive: readBooleanOption(type, selector, options, 'passive'),
    freq: readEnumOption(type, selector, options, 'freq', frequencies, 'always'),
  }
}

/**
 * @template {string} Value
 * @param {string} type
 * @param {string} selector
 * @param {object} options
 * @param {string} name
 * @param {ReadonlyArray<Value>} allowed
 * @param {Value} fallback
 * @returns {Value}
 */
function readEnumOption(type, selector, options, name, allowed, fallback) {
  const value = Reflect.get(options, name)

  if (value === undefined) {
    return fallback
  }

  if (
    typeof value !== 'string'
    || !allowed.includes(/** @type {Value} */ (value))
  ) {
    throw invalidEventBinding(
      type,
      selector,
      `options.${name} must be ${listValues(allowed)}`,
    )
  }

  return /** @type {Value} */ (value)
}

/**
 * @param {string} type
 * @param {string} selector
 * @param {object} options
 * @param {string} name
 * @returns {boolean}
 */
function readBooleanOption(type, selector, options, name) {
  const value = Reflect.get(options, name)

  if (value === undefined) {
    return false
  }

  if (typeof value !== 'boolean') {
    throw invalidEventBinding(
      type,
      selector,
      `options.${name} must be a boolean`,
    )
  }

  return value
}

/**
 * @param {ReadonlyArray<string>} values
 * @returns {string}
 */
function listValues(values) {
  const quoted = values.map(value => `"${value}"`)

  return quoted.length < 2
    ? quoted.join('')
    : `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`
}

/**
 * @param {string} type
 * @param {string} selector
 * @param {string} reason
 * @returns {TypeError}
 */
function invalidEventBinding(type, selector, reason) {
  return new TypeError(
    `Invalid Lumi event binding for "${type}" on "${selector}": ${reason}`,
  )
}

/**
 * Advises about a component declaration that a well-known native event type
 * normally cannot reach. This stays a warning because a custom event may
 * reuse any type string and choose its own bubbles value.
 *
 * @param {EventBindingDescriptor} descriptor
 */
function warnAboutNonBubblingComponentEvent(descriptor) {
  if (
    descriptor.at !== 'component'
    || descriptor.capture
    || !nonBubblingEventTypes.has(descriptor.type)
    || !isDevelopment()
  ) {
    return
  }

  console.warn(
    `Lumi component event "${descriptor.type}" normally does not bubble.\n`
    + '\nUse:\n'
    + '  {at: "elements"}\n'
    + 'for native listeners on matching elements, or:\n'
    + '  {capture: true}\n'
    + 'for intentional component capture.',
  )
}

/**
 * Development diagnostics stay on unless the host declares a production
 * environment.
 *
 * @returns {boolean}
 */
function isDevelopment() {
  const process = Reflect.get(globalThis, 'process')

  if (typeof process !== 'object' || process === null) {
    return true
  }

  const environment = Reflect.get(process, 'env')

  if (typeof environment !== 'object' || environment === null) {
    return true
  }

  return Reflect.get(environment, 'NODE_ENV') !== 'production'
}
