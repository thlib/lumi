// @ts-check

/**
 * Package-internal DOM planning primitives. The supported package surface is
 * exported only from index.js.
 *
 * @internal
 */

import {
  createElementQuery,
  elementDepth,
  elementPath,
  importElementTree,
  queryOwnedElements,
} from './dom.js'
import { connectCardinalityDomBindings } from './cardinality.js'
import {warn} from './internal/diagnostics.js'
import { isNoValue, noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {rootContext} from './internal/projection-context.js'
import {
  isStructuralBinding,
  isStructuralProperty,
} from './internal/structural.js'

const domBindingDescriptor = Symbol('Lumi DOM binding descriptor')
const ownedDomSubtrees = Symbol('Lumi owned DOM subtrees')
const noOperation = () => {}
const classWhitespace = '[\\t\\n\\f\\r ]'
// Marks a batch match that an earlier hoisted content operation planned.
const unplannedMatch = Symbol('Lumi unplanned match')

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * @typedef {ReturnType<typeof createElementQuery>} ElementQuery
 */

/**
 * The Trusted Types capability Lumi needs to authenticate TrustedHTML.
 * Some TypeScript DOM libraries do not yet declare this browser API.
 *
 * @typedef {(value: unknown) => boolean} TrustedHTMLCheck
 */

/**
 * @typedef {'repeat' | 'text' | 'property' | 'attribute' | 'class' | 'style'} DomBindingKind
 */

/**
 * @template Data
 * @typedef {object} DomBindingDescriptor
 * @property {DomBindingKind} kind
 * @property {string} selector
 * @property {(input: any, el: Element) => unknown} project
 * @property {((input: any) => unknown) | undefined} [key]
 * @property {string} [name]
 * @property {DomBindingDescriptor<Data>} [scope]
 * @property {ReadonlyArray<DomBindingDescriptor<Data>>} [bindings]
 */

/**
 * @typedef {object} CachedValue
 * @property {unknown} projectedValue
 * @property {unknown} domValue
 */

/**
 * @template Data
 * @typedef {object} DomBindingRuntime
 * @property {DomBindingDescriptor<Data>} descriptor
 * @property {number} index
 * @property {WeakMap<Element, CachedValue>} values
 * @property {boolean} requiresTrustedHTML
 * @property {Set<string>} warnings
 * @property {Window | null} view
 * @property {(projected: unknown, trustedTypes: TrustedHTMLCheck | null) => unknown} normalize
 * @property {(element: Element, value: unknown) => boolean} apply
 * @property {(element: Element, value: unknown) => boolean} changes
 */

/**
 * @template Data
 * @typedef {object} SingleOperation
 * @property {'single'} type
 * @property {DomBindingRuntime<Data>} runtime
 * @property {number} matchIndex
 * @property {unknown} value
 */

/**
 * @template Data
 * @typedef {object} BatchOperation
 * @property {'batch'} type
 * @property {DomBindingRuntime<Data>} runtime
 * @property {ReadonlyArray<unknown>} values
 */

/**
 * @template Data
 * @typedef {SingleOperation<Data> | BatchOperation<Data>} DomOperation
 */

/**
 * Operations that the direct planner prepared. When `complete` is false, the
 * staged planner continues with hoisted content tasks (`nextRuntime` is -1)
 * or with the declaration at `nextRuntime`.
 *
 * @template Data
 * @typedef {object} DirectProgress
 * @property {boolean} complete
 * @property {Array<DomOperation<Data>>} operations
 * @property {number} nextRuntime
 */

/**
 * @template Data
 * @typedef {object} ParentCacheRecord
 * @property {DomBindingRuntime<Data>} runtime
 * @property {Element} element
 * @property {unknown} value
 * @property {boolean} hasDescendantOperation
 * @property {boolean} isSuperseded
 */

/**
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @returns {import('./types.js').Binding<Data>}
 */
export function createDomBinding(descriptor) {
  const binding = {
    [domBindingDescriptor]: descriptor,

    connect(/** @type {Element} */ root) {
      return connectDomBindings(root, flattenDomBindingDescriptors([descriptor]))
    },
  }

  return /** @type {import('./types.js').Binding<Data>} */ (binding)
}

/**
 * Returns Lumi's internal descriptor for a built-in scalar binding.
 *
 * @template Data
 * @param {import('./types.js').Binding<Data>} binding
 * @returns {DomBindingDescriptor<Data> | null}
 */
export function getDomBindingDescriptor(binding) {
  if (
    typeof binding !== 'object'
    || binding === null
    || !Reflect.has(binding, domBindingDescriptor)
  ) {
    return null
  }

  return /** @type {DomBindingDescriptor<Data>} */ (
    Reflect.get(binding, domBindingDescriptor)
  )
}

/**
 * Returns one built-in DOM declaration and every nested declaration owned by
 * an optional repeat binding list. Nested declarations retain their owning
 * repeat so the cardinality planner can resolve their selectors locally.
 *
 * @template Data
 * @param {ReadonlyArray<DomBindingDescriptor<Data>>} descriptors
 * @param {DomBindingDescriptor<Data> | undefined} [scope]
 * @param {Array<DomBindingDescriptor<Data>>} [flattened]
 * @returns {ReadonlyArray<DomBindingDescriptor<Data>>}
 */
export function flattenDomBindingDescriptors(
  descriptors,
  scope = undefined,
  flattened = [],
) {
  for (const descriptor of descriptors) {
    const declaration = scope === undefined
      ? descriptor
      : {...descriptor, scope}

    flattened.push(declaration)

    if (descriptor.bindings !== undefined) {
      flattenDomBindingDescriptors(
        descriptor.bindings,
        declaration,
        flattened,
      )
    }
  }

  return flattened
}

/**
 * Marks a child container as a subtree owned by its connected binding.
 *
 * @template Data
 * @param {import('./types.js').ConnectedBinding<Data>} connected
 * @param {Element} container
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function claimDomSubtree(connected, container) {
  Reflect.defineProperty(connected, ownedDomSubtrees, {
    value: [container],
  })
  return connected
}

/**
 * @template Data
 * @param {import('./types.js').ConnectedBinding<Data>} connected
 * @returns {ReadonlyArray<Element>}
 */
export function getOwnedDomSubtrees(connected) {
  const owned = Reflect.get(connected, ownedDomSubtrees)
  return Array.isArray(owned)
    ? /** @type {ReadonlyArray<Element>} */ (owned)
    : []
}

/**
 * Connects all built-in scalar declarations to one DOM-aware update planner.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingDescriptor<Data>>} descriptors
 * @param {ReadonlyArray<Element>} [ownedSubtrees]
 * @param {(roots: ReadonlySet<ShadowRoot>) => void} [publishShadowRoots]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function connectDomBindings(
  root,
  descriptors,
  ownedSubtrees = [],
  publishShadowRoots,
) {
  /** @type {Array<DomBindingRuntime<Data>>} */
  const runtimes = descriptors.map((descriptor, index) => {
    return createDomBindingRuntime(descriptor, index, root)
  })
  const trustedTypes = runtimes.some(runtime => runtime.requiresTrustedHTML)
    ? trustedTypesFactory(root)
    : null

  if (!runtimes.some(runtime => runtime.descriptor.kind === 'repeat')) {
    return connectScalarDomBindings(
      root,
      runtimes,
      ownedSubtrees,
      trustedTypes,
      publishShadowRoots,
    )
  }

  const planningDocument = root.ownerDocument.implementation
    .createHTMLDocument()
  const blueprintRoot = importElementTree(planningDocument, root)
  const ownedSubtreePaths = ownedSubtrees.map(subtree => {
    return elementPath(
      root,
      subtree,
      'Lumi owned subtree left its component boundary',
    )
  })
  return connectCardinalityDomBindings(
    root,
    blueprintRoot,
    /** @type {ReadonlyArray<import('./cardinality.js').Runtime>} */ (
      runtimes
    ),
    ownedSubtreePaths,
    (runtime, projected) => {
      return normalizeProjectedValue(
        /** @type {DomBindingRuntime<Data>} */ (runtime),
        projected,
        trustedTypes,
      )
    },
    (runtime, element, value) => {
      applyLiveValue(
        /** @type {DomBindingRuntime<Data>} */ (runtime),
        element,
        value,
      )
    },
  )
}

/**
 * Compiles binding-kind-specific normalization and application once when a
 * component connects, keeping the per-element update loop monomorphic.
 *
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @param {number} index
 * @param {Element} root
 * @returns {DomBindingRuntime<Data>}
 */
function createDomBindingRuntime(descriptor, index, root) {
  const requiresTrustedHTML = descriptor.kind === 'property'
    && (descriptor.name === 'innerHTML' || descriptor.name === 'outerHTML')
  /** @type {DomBindingRuntime<Data>} */
  const runtime = {
    descriptor,
    index,
    values: new WeakMap(),
    requiresTrustedHTML,
    warnings: new Set(),
    view: root.ownerDocument.defaultView,
    normalize: () => noValue,
    apply: () => false,
    changes: () => false,
  }

  runtime.normalize = createRuntimeNormalizer(runtime)
  runtime.apply = createRuntimeApply(runtime)
  runtime.changes = createRuntimeChange(runtime)
  return runtime
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 */
function createRuntimeNormalizer(runtime) {
  const descriptor = runtime.descriptor

  switch (descriptor.kind) {
    case 'repeat':
      return (/** @type {unknown} */ projected) => {
        if (!Array.isArray(projected)) {
          warnIgnored(runtime, projected, 'an array')
          return noValue
        }

        for (let i = 0; i < projected.length; i += 1) {
          if (!Object.hasOwn(projected, i)) {
            warnIgnored(runtime, projected, 'a dense array', 'sparse array')
            return noValue
          }
        }
        return projected
      }
    case 'text':
      return (/** @type {unknown} */ projected) => {
        if (!isTextValue(projected)) {
          warnIgnored(
            runtime,
            projected,
            'a string, number, or boolean',
          )
          return noValue
        }
        return String(projected)
      }
    case 'property': {
      if (!runtime.requiresTrustedHTML) {
        return (/** @type {unknown} */ projected) => projected
      }

      const name = /** @type {string} */ (descriptor.name)
      return (
        /** @type {unknown} */ projected,
        /** @type {TrustedHTMLCheck | null} */ trustedTypes,
      ) => {
        assertTrustedHTML(projected, trustedTypes, name)
        return projected
      }
    }
    case 'attribute': {
      // Decided once per declaration so the update path pays one boolean test.
      const isAria = /^aria-/i.test(/** @type {string} */ (descriptor.name))
      return (/** @type {unknown} */ projected) => {
        if (!isTextValue(projected)) {
          warnIgnored(runtime, projected, 'a string, number, or boolean')
          return noValue
        }
        if (isAria && projected === true) {
          warnAriaBoolean(runtime)
        }
        return projected === false
          ? false
          : projected === true
            ? ''
            : String(projected)
      }
    }
    case 'class':
      return (/** @type {unknown} */ projected) => {
        if (typeof projected !== 'boolean') {
          warnIgnored(runtime, projected, 'a boolean')
          return noValue
        }
        return projected
      }
    case 'style':
      return (/** @type {unknown} */ projected) => {
        if (typeof projected !== 'string') {
          warnIgnored(runtime, projected, 'a string')
          return noValue
        }
        return projected
      }
  }
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 */
function createRuntimeApply(runtime) {
  const descriptor = runtime.descriptor

  switch (descriptor.kind) {
    case 'repeat':
      return () => false
    case 'text':
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        if (element.textContent === value) {
          return false
        }

        element.textContent = /** @type {string} */ (value)
        return true
      }
    case 'property': {
      const name = /** @type {string} */ (descriptor.name)
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const current = Reflect.get(element, name)
        const projectedValue = projectedCacheValue(runtime, value)
        const shouldWrite = !isPropertyCurrent(
          current,
          projectedValue,
          runtime.values.get(element),
        )

        if (shouldWrite) {
          setProperty(element, name, value)
        }

        runtime.values.set(element, {
          projectedValue,
          domValue: Reflect.get(element, name),
        })
        return shouldWrite
      }
    }
    case 'attribute': {
      const name = /** @type {string} */ (descriptor.name)
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        return setAttributeValue(element, name, value)
      }
    }
    case 'class': {
      const name = /** @type {string} */ (descriptor.name)
      const valid = isValidClassToken(name)
      const occurrence = classTokenOccurrence(name)

      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const next = /** @type {boolean} */ (value)

        // Keep native DOMTokenList errors for invalid tokens. Valid fixed
        // tokens use the raw attribute so an update does not create and
        // search a DOMTokenList for all classes on the element.
        if (!valid) {
          if (element.classList.contains(name) === next) {
            return false
          }

          element.classList.toggle(name, next)
          return true
        }

        const current = element.getAttribute('class') ?? ''

        if ((current.search(occurrence) >= 0) === next) {
          return false
        }

        const className = next
          ? appendClassToken(current, name)
          : current.replace(occurrence, '$1')
        element.setAttribute('class', className)
        return true
      }
    }
    case 'style': {
      const name = /** @type {string} */ (descriptor.name)
      const property = styleProperty(name)

      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const styledElement = asStyledElement(element)
        const declaration = styledElement.style

        if (
          property !== null
          && typeof Reflect.get(declaration, property) === 'string'
        ) {
          const style = /** @type {Record<string, unknown>} */ (
            /** @type {unknown} */ (declaration)
          )
          const current = style[property]

          if (current === value) {
            return false
          }

          style[property] = /** @type {string} */ (value)
          return true
        }

        const current = declaration.getPropertyValue(name)

        if (current === value) {
          return false
        }

        if (value === '') {
          declaration.removeProperty(name)
        } else {
          declaration.setProperty(name, /** @type {string} */ (value))
        }
        return true
      }
    }
  }
}

/**
 * Compiles a read-only check that tells whether applying one value to the
 * current DOM can change the result of a later selector resolution. Any
 * attribute, class token, property, or inline style write can do that. A
 * text write changes only text when the element keeps one non-empty text
 * node, so only a write that changes the element's child nodes otherwise
 * (for example the result of `:empty`) is a change.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @returns {(element: Element, value: unknown) => boolean}
 */
function createRuntimeChange(runtime) {
  const descriptor = runtime.descriptor

  switch (descriptor.kind) {
    case 'repeat':
      return () => false
    case 'text':
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const first = element.firstChild

        if (
          value !== ''
          && first !== null
          && first.nodeType === 3
          && first.nextSibling === null
          && /** @type {Text} */ (first).data !== ''
        ) {
          return false
        }

        return element.textContent !== value
      }
    case 'property': {
      const name = /** @type {string} */ (descriptor.name)
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        return !isPropertyCurrent(
          Reflect.get(element, name),
          projectedCacheValue(runtime, value),
          runtime.values.get(element),
        )
      }
    }
    case 'attribute': {
      const name = /** @type {string} */ (descriptor.name)
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        return attributeValue(element, name) !== value
      }
    }
    case 'class': {
      const name = /** @type {string} */ (descriptor.name)
      const valid = isValidClassToken(name)
      const occurrence = classTokenOccurrence(name)

      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const present = valid
          ? (element.getAttribute('class') ?? '').search(occurrence) >= 0
          : element.classList.contains(name)
        return present !== value
      }
    }
    case 'style': {
      const name = /** @type {string} */ (descriptor.name)
      const property = styleProperty(name)

      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const declaration = asStyledElement(element).style
        const current = (
          property !== null
          && typeof Reflect.get(declaration, property) === 'string'
        )
          ? Reflect.get(declaration, property)
          : declaration.getPropertyValue(name)
        return current !== value
      }
    }
  }
}

/**
 * Connects the existing one-value-per-match planner.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @param {(roots: ReadonlySet<ShadowRoot>) => void} [publishShadowRoots]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
function connectScalarDomBindings(
  root,
  runtimes,
  ownedSubtrees,
  trustedTypes,
  publishShadowRoots,
) {
  /** @type {Document | null} */
  let planningDocument = null

  return {
    prepare(data) {
      const liveQuery = createElementQuery(root)
      const staging = analyzeStaging(
        root,
        runtimes,
        ownedSubtrees,
        liveQuery,
      )
      /** @type {DirectProgress<Data> | null} */
      const progress = staging.required
        ? null
        : prepareDirectUpdate(
          root,
          runtimes,
          ownedSubtrees,
          staging.elementsByRuntime,
          data,
          trustedTypes,
        )

      if (progress !== null && progress.complete) {
        return preparedDomUpdate(
          root,
          progress.operations,
          ownedSubtrees,
          liveQuery,
          publishShadowRoots,
        )
      }

      // Import into a document without a browsing context or custom-element
      // registry. Unlike cloneNode() in the live document, this cannot invoke
      // custom-element constructors merely to prepare an update. Each update
      // imports a new detached copy, so one document serves all updates.
      planningDocument ??= root.ownerDocument.implementation
        .createHTMLDocument()
      const operations = prepareStagedUpdate(
        planningDocument,
        root,
        runtimes,
        ownedSubtrees,
        staging.elementsByRuntime,
        data,
        trustedTypes,
        progress,
      )

      return preparedDomUpdate(
        root,
        operations,
        ownedSubtrees,
        liveQuery,
        publishShadowRoots,
      )
    },

    destroy() {
      planningDocument = null
    },
  }
}

/**
 * Uses the live tree as a read-only preparation view. The operations and the
 * projection calls occur in the same order as in the staged planner. The live
 * view stays correct only while no prepared write can change the result of a
 * later selector resolution. When a write can do that, the direct planner
 * stops and returns its progress, and the staged planner continues from it.
 * Thus no projection runs two times in one update.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ReadonlyArray<ReadonlyArray<Element>>} elementsByRuntime
 * @param {Data} data
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @returns {DirectProgress<Data>}
 */
function prepareDirectUpdate(
  root,
  runtimes,
  ownedSubtrees,
  elementsByRuntime,
  data,
  trustedTypes,
) {
  /** @type {Array<DomOperation<Data>>} */
  const operations = []
  const hoisted = directHoistedTasks(root, runtimes, elementsByRuntime)

  for (const task of hoisted) {
    const value = projectValue(
      task.runtime,
      data,
      task.element,
      task.matchIndex,
      trustedTypes,
    )

    validateDirectStructuralTarget(
      task.runtime,
      task.element,
      root,
      ownedSubtrees,
    )
    operations.push({
      type: 'single',
      runtime: task.runtime,
      matchIndex: task.matchIndex,
      value,
    })

    if (!isNoValue(value) && task.runtime.changes(task.element, value)) {
      return { complete: false, operations, nextRuntime: -1 }
    }
  }

  const lastRuntime = runtimes.length - 1

  for (let runtimeIndex = 0; runtimeIndex <= lastRuntime; runtimeIndex += 1) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined) {
      continue
    }

    const elements = elementsByRuntime[runtimeIndex] ?? []
    const structural = isStructuralBinding(runtime.descriptor)
    let planned = false
    const values = elements.map((element, matchIndex) => {
      if (
        structural
        && hoisted.length > 0
        && isHoistedContent(runtime, element)
      ) {
        return unplannedMatch
      }

      planned = true
      return projectValue(
        runtime,
        data,
        element,
        matchIndex,
        trustedTypes,
      )
    })

    if (!planned) {
      continue
    }

    if (structural) {
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index]

        if (element !== undefined && values[index] !== unplannedMatch) {
          validateDirectStructuralTarget(
            runtime,
            element,
            root,
            ownedSubtrees,
          )
        }
      }
    }

    operations.push({
      type: 'batch',
      runtime,
      values,
    })

    // The last declaration is resolved before its own writes, and no other
    // declaration is resolved after it.
    if (
      runtimeIndex < lastRuntime
      && batchChangesDom(runtime, elements, values)
    ) {
      return { complete: false, operations, nextRuntime: runtimeIndex + 1 }
    }
  }

  return { complete: true, operations, nextRuntime: runtimes.length }
}

/**
 * Lists the hoisted content tasks of the unchanged live view in the order in
 * which the staged planner selects them.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<ReadonlyArray<Element>>} elementsByRuntime
 * @returns {Array<{
 *   runtime: DomBindingRuntime<Data>,
 *   element: Element,
 *   matchIndex: number,
 *   depth: number
 * }>}
 */
function directHoistedTasks(root, runtimes, elementsByRuntime) {
  /** @type {Array<{
   *   runtime: DomBindingRuntime<Data>,
   *   element: Element,
   *   matchIndex: number,
   *   depth: number
   * }>} */
  const tasks = []

  for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined || !isStructuralBinding(runtime.descriptor)) {
      continue
    }

    const elements = elementsByRuntime[runtimeIndex] ?? []

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = elements[matchIndex]

      if (element !== undefined && isHoistedContent(runtime, element)) {
        tasks.push({
          runtime,
          element,
          matchIndex,
          depth: elementDepth(root, element),
        })
      }
    }
  }

  if (tasks.length > 1) {
    tasks.sort((left, right) => {
      return left.depth - right.depth
        || left.runtime.index - right.runtime.index
        || left.matchIndex - right.matchIndex
    })
  }

  return tasks
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {ReadonlyArray<Element>} elements
 * @param {ReadonlyArray<unknown>} values
 * @returns {boolean}
 */
function batchChangesDom(runtime, elements, values) {
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]
    const value = values[index]

    if (
      element !== undefined
      && value !== unplannedMatch
      && !isNoValue(value)
      && runtime.changes(element, value)
    ) {
      return true
    }
  }

  return false
}

/**
 * Plans an update in an inert copy of the component. Content writes that can
 * remove or create elements are planned first, in DOM ancestor order, so the
 * selectors for their descendants see the planned result. All other writes
 * are planned in declaration order: each declaration resolves its selector
 * after the earlier planned writes. When the direct planner has prepared part
 * of the update, this function replays those operations in the copy and
 * continues after them.
 *
 * @template Data
 * @param {Document} planningDocument
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ReadonlyArray<ReadonlyArray<Element>>} elementsByRuntime
 * @param {Data} data
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @param {DirectProgress<Data> | null} progress
 * @returns {Array<DomOperation<Data>>}
 */
function prepareStagedUpdate(
  planningDocument,
  root,
  runtimes,
  ownedSubtrees,
  elementsByRuntime,
  data,
  trustedTypes,
  progress,
) {
  const planningRoot = importElementTree(planningDocument, root)
  /** @type {WeakMap<Element, Element>} */
  const liveByPlanned = new WeakMap()
  /** @type {WeakMap<Element, Element>} */
  const plannedByLive = new WeakMap()
  pairElementTrees(root, planningRoot, liveByPlanned, plannedByLive)
  const plannedOwnedSubtrees = ownedSubtrees.map(subtree => {
    const planned = plannedByLive.get(subtree)

    if (planned === undefined) {
      throw new Error('Lumi lost an owned DOM subtree while planning')
    }

    return planned
  })

  // Planned content writes cannot attach a shadow root, so the shadow
  // topology of the copy can only become smaller. One query stays correct.
  const planningQuery = createElementQuery(planningRoot)
  /** @type {Map<DomBindingRuntime<Data>, WeakSet<Element>>} */
  const processedByRuntime = new Map()
  /** @type {WeakMap<Element, ReadonlySet<number>>} */
  const createdBy = new WeakMap()
  /** @type {Array<DomOperation<Data>>} */
  const operations = progress === null ? [] : progress.operations

  for (const runtime of runtimes) {
    if (isStructuralBinding(runtime.descriptor)) {
      processedByRuntime.set(runtime, new WeakSet())
    }
  }

  /**
   * @param {DomBindingRuntime<Data>} runtime
   * @param {Element} element
   * @param {unknown} value
   */
  const plan = (runtime, element, value) => {
    const processed = processedByRuntime.get(runtime)
    /** @type {Set<number>} */
    const creationHistory = new Set()

    if (processed !== undefined) {
      processed.add(element)

      for (const index of createdBy.get(element) ?? []) {
        creationHistory.add(index)
      }

      creationHistory.add(runtime.index)
    }

    applyPlannedValue(
      runtime,
      element,
      value,
      planningRoot,
      liveByPlanned.get(element),
      createdBy,
      creationHistory,
      plannedOwnedSubtrees,
    )
  }

  /**
   * @param {Element | undefined} live
   * @returns {Element}
   */
  const plannedElement = live => {
    const planned = live === undefined ? undefined : plannedByLive.get(live)

    if (planned === undefined) {
      throw new Error('Lumi lost a prepared DOM target while planning')
    }

    return planned
  }

  // The direct operations were resolved in the unchanged live view, which
  // equals the copy until the last of them. Replay them in the same order.
  for (const operation of operations) {
    const elements = elementsByRuntime[operation.runtime.index] ?? []

    if (operation.type === 'single') {
      plan(
        operation.runtime,
        plannedElement(elements[operation.matchIndex]),
        operation.value,
      )
      continue
    }

    for (let index = 0; index < operation.values.length; index += 1) {
      const value = operation.values[index]

      if (value !== unplannedMatch) {
        plan(operation.runtime, plannedElement(elements[index]), value)
      }
    }
  }

  if (progress === null || progress.nextRuntime < 0) {
    while (true) {
      const task = nextStructuralTask(
        planningRoot,
        runtimes,
        processedByRuntime,
        createdBy,
        plannedOwnedSubtrees,
        planningQuery,
      )

      if (task === null) {
        break
      }

      const value = projectValue(
        task.runtime,
        data,
        task.element,
        task.matchIndex,
        trustedTypes,
      )

      plan(task.runtime, task.element, value)
      operations.push({
        type: 'single',
        runtime: task.runtime,
        matchIndex: task.matchIndex,
        value,
      })
    }
  }

  const firstRuntime = progress === null || progress.nextRuntime < 0
    ? 0
    : progress.nextRuntime

  for (
    let runtimeIndex = firstRuntime;
    runtimeIndex < runtimes.length;
    runtimeIndex += 1
  ) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined) {
      continue
    }

    const processed = processedByRuntime.get(runtime)
    const elements = queryOwnedElements(
      planningRoot,
      runtime.descriptor.selector,
      plannedOwnedSubtrees,
      planningQuery,
    )
    let planned = false
    const values = elements.map((element, matchIndex) => {
      if (
        processed !== undefined
        && (
          processed.has(element)
          || createdBy.get(element)?.has(runtime.index) === true
        )
      ) {
        return unplannedMatch
      }

      planned = true
      return projectValue(
        runtime,
        data,
        element,
        matchIndex,
        trustedTypes,
      )
    })

    if (!planned) {
      continue
    }

    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index]
      const value = values[index]

      if (element !== undefined && value !== unplannedMatch) {
        plan(runtime, element, value)
      }
    }

    operations.push({
      type: 'batch',
      runtime,
      values,
    })
  }

  return operations
}

/**
 * Returns whether a content write at this element can remove or create
 * elements. The planner plans such a write before the rules for descendants.
 * A text write to an element without element children changes only text, so
 * it keeps its declaration order.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Element} element
 * @returns {boolean}
 */
function isHoistedContent(runtime, element) {
  const descriptor = runtime.descriptor

  if (descriptor.kind === 'text') {
    return element.firstElementChild !== null
  }

  if (descriptor.kind !== 'property' || !isStructuralProperty(descriptor.name)) {
    return false
  }

  return descriptor.name !== 'textContent'
    || element.firstElementChild !== null
}

/**
 * Staging is needed from the start when a content write can change another
 * binding's targets or cross a nested component ownership boundary. The
 * direct planner finds other writes that change selector matches.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ElementQuery} liveQuery
 * @returns {{
 *   required: boolean,
 *   elementsByRuntime: ReadonlyArray<ReadonlyArray<Element>>
 * }}
 */
function analyzeStaging(root, runtimes, ownedSubtrees, liveQuery) {
  const elementsByRuntime = runtimes.map(runtime => {
    return queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
      liveQuery,
    )
  })
  /** @type {Map<Element, number>} */
  const runtimeByElement = new Map()
  /** @type {Map<Element, number>} */
  const structuralRuntimeByElement = new Map()

  for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined) {
      continue
    }

    const elements = elementsByRuntime[runtimeIndex] ?? []

    for (const element of elements) {
      recordRuntime(runtimeByElement, element, runtimeIndex)

      if (isStructuralBinding(runtime.descriptor)) {
        recordRuntime(structuralRuntimeByElement, element, runtimeIndex)
      }
    }
  }

  // A structural target cannot replace a child binding's owned subtree.
  // Walking upward from each owned root avoids comparing every structural
  // target with every owned subtree.
  for (const owned of ownedSubtrees) {
    let current = /** @type {Element | null} */ (owned)

    while (current !== null) {
      if (structuralRuntimeByElement.has(current)) {
        return { required: true, elementsByRuntime }
      }

      current = current.parentElement
    }
  }

  // Walk each distinct match toward its tree root. This preserves the exact
  // contains() relationship used by the former nested search, including its
  // deliberate separation at ShadowRoot boundaries, while avoiding a full
  // structural-target × matched-element comparison.
  for (const [element, matchingRuntime] of runtimeByElement) {
    let current = /** @type {Element | null} */ (element)

    while (current !== null) {
      const structuralRuntime = structuralRuntimeByElement.get(current)

      if (
        structuralRuntime !== undefined
        && (
          current !== element
          || structuralRuntime !== matchingRuntime
          || structuralRuntime === -1
        )
      ) {
        // A declaration does not depend on itself at one target. Any other
        // declaration at the same element is a real ordered dependency.
        return { required: true, elementsByRuntime }
      }

      current = current.parentElement
    }
  }

  return {
    required: structuralRuntimeByElement.size > 0
      && elementsByRuntime.some(elements => elements.length === 0),
    elementsByRuntime,
  }
}

/**
 * Records one declaration index, or -1 when several declarations share an
 * element.
 *
 * @param {Map<Element, number>} owners
 * @param {Element} element
 * @param {number} runtimeIndex
 */
function recordRuntime(owners, element, runtimeIndex) {
  owners.set(element, owners.has(element) ? -1 : runtimeIndex)
}

/**
 * Ensures ownership and component-root failures remain preparation failures
 * on the direct path.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Element} element
 * @param {Element} root
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function validateDirectStructuralTarget(
  runtime,
  element,
  root,
  ownedSubtrees,
) {
  const descriptor = runtime.descriptor

  assertDoesNotReplaceOwnedSubtree(element, ownedSubtrees)

  if (
    descriptor.kind === 'property'
    && descriptor.name === 'outerHTML'
    && element === root
  ) {
    throw new TypeError(
      'Lumi cannot replace a mounted component root with outerHTML',
    )
  }
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomOperation<Data>>} operations
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ElementQuery} liveQuery
 * @param {(roots: ReadonlySet<ShadowRoot>) => void} [publishShadowRoots]
 * @returns {import('./types.js').PreparedUpdate}
 */
function preparedDomUpdate(
  root,
  operations,
  ownedSubtrees,
  liveQuery,
  publishShadowRoots,
) {
  return {
    commit() {
      // Custom binding commits run between preparation and this DOM commit.
      // Refresh once in case one changed the component's shadow topology.
      liveQuery.invalidate()
      /** @type {Array<ParentCacheRecord<Data>>} */
      const parentCacheRecords = []

      for (const operation of operations) {
        const elements = queryOwnedElements(
          root,
          operation.runtime.descriptor.selector,
          ownedSubtrees,
          liveQuery,
        )

        if (operation.type === 'single') {
          const element = elements[operation.matchIndex]

          if (element === undefined) {
            throw changedDuringCommit(
              operation.runtime.descriptor.selector,
            )
          }

          trackParentCache(
            parentCacheRecords,
            operation.runtime,
            element,
            operation.value,
          )
          const changed = applyLiveValue(
            operation.runtime,
            element,
            operation.value,
          )
          if (changed) {
            liveQuery.recheck(element)
          }
          continue
        }

        if (elements.length !== operation.values.length) {
          throw changedDuringCommit(
            operation.runtime.descriptor.selector,
          )
        }

        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index]

          if (
            element !== undefined
            && operation.values[index] !== unplannedMatch
          ) {
            trackParentCache(
              parentCacheRecords,
              operation.runtime,
              element,
              operation.values[index],
            )
            const changed = applyLiveValue(
              operation.runtime,
              element,
              operation.values[index],
            )
            if (changed) {
              liveQuery.recheck(element)
            }
          }
        }
      }

      refreshParentCaches(parentCacheRecords)
      publishShadowRoots?.(liveQuery.openShadowRoots())
    },
  }
}

/**
 * Remembers which parent content projections contain later scalar work.
 * Same-element content writers supersede earlier parent cache records.
 *
 * @template Data
 * @param {Array<ParentCacheRecord<Data>>} records
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Element} element
 * @param {unknown} value
 */
function trackParentCache(records, runtime, element, value) {
  for (const record of records) {
    if (record.element === element) {
      if (isStructuralBinding(runtime.descriptor)) {
        record.isSuperseded = true
      }
    } else if (record.element.contains(element)) {
      record.hasDescendantOperation = true
    }
  }

  if (canCacheFinalSubtree(runtime.descriptor)) {
    records.push({
      runtime,
      element,
      value,
      hasDescendantOperation: false,
      isSuperseded: false,
    })
  }
}

/**
 * Parent structural properties may establish content that descendant rules
 * refine. Cache the final refined DOM, rather than the parent's intermediate
 * write, so the next update does not rebuild a still-authoritative subtree.
 *
 * @template Data
 * @param {ReadonlyArray<ParentCacheRecord<Data>>} records
 */
function refreshParentCaches(records) {
  for (const record of records) {
    if (
      !record.hasDescendantOperation
      || record.isSuperseded
    ) {
      continue
    }

    const runtime = record.runtime
    const descriptor = runtime.descriptor
    const domValue = Reflect.get(
      record.element,
      /** @type {string} */ (descriptor.name),
    )

    runtime.values.set(record.element, {
      projectedValue: projectedCacheValue(runtime, record.value),
      domValue,
    })
  }
}

/**
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @returns {boolean}
 */
function canCacheFinalSubtree(descriptor) {
  return descriptor.kind === 'property'
    && (
      descriptor.name === 'innerHTML'
      || descriptor.name === 'innerText'
      || descriptor.name === 'textContent'
    )
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {Map<DomBindingRuntime<Data>, WeakSet<Element>>} processedByRuntime
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ElementQuery} query
 * @returns {{
 *   runtime: DomBindingRuntime<Data>,
 *   element: Element,
 *   matchIndex: number,
 *   depth: number
 * } | null}
 */
function nextStructuralTask(
  root,
  runtimes,
  processedByRuntime,
  createdBy,
  ownedSubtrees,
  query,
) {
  /** @type {{
   *   runtime: DomBindingRuntime<Data>,
   *   element: Element,
   *   matchIndex: number,
   *   depth: number
   * } | null} */
  let selected = null

  for (const runtime of runtimes) {
    if (!isStructuralBinding(runtime.descriptor)) {
      continue
    }

    const processed = processedByRuntime.get(runtime)
    const elements = queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
      query,
    )

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = elements[matchIndex]

      if (
        element === undefined
        || processed?.has(element) === true
        || createdBy.get(element)?.has(runtime.index) === true
        || !isHoistedContent(runtime, element)
      ) {
        continue
      }

      const depth = elementDepth(root, element)

      if (
        selected === null
        || depth < selected.depth
        || (
          depth === selected.depth
          && runtime.index < selected.runtime.index
        )
        || (
          depth === selected.depth
          && runtime.index === selected.runtime.index
          && matchIndex < selected.matchIndex
        )
      ) {
        selected = {
          runtime,
          element,
          matchIndex,
          depth,
        }
      }
    }
  }

  return selected
}

/**
 * Keeps the authenticated TrustedHTML object intact for the native setter,
 * while comparing its immutable string data with the DOM's serialized value.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {unknown} value
 * @returns {unknown}
 */
function projectedCacheValue(runtime, value) {
  return runtime.requiresTrustedHTML ? String(value) : value
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Data} data
 * @param {Element} element
 * @param {number} matchIndex
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @returns {unknown}
 */
function projectValue(runtime, data, element, matchIndex, trustedTypes) {
  const descriptor = runtime.descriptor
  let projected

  try {
    projected = descriptor.project(rootContext(data), element)
  } catch (error) {
    throw projectionError(descriptor, matchIndex, error)
  }

  return normalizeProjectedValue(runtime, projected, trustedTypes)
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {unknown} projected
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @returns {unknown}
 */
function normalizeProjectedValue(runtime, projected, trustedTypes) {
  if (projected === null || projected === undefined) {
    return noValue
  }

  return runtime.normalize(projected, trustedTypes)
}

/**
 * Applies one value to detached planning DOM. Structural writes mark any
 * elements they create so a declaration cannot recursively select its own
 * output forever.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Element} element
 * @param {unknown} value
 * @param {Element} planningRoot
 * @param {Element | undefined} liveElement
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @param {ReadonlySet<number>} creationHistory
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function applyPlannedValue(
  runtime,
  element,
  value,
  planningRoot,
  liveElement,
  createdBy,
  creationHistory,
  ownedSubtrees,
) {
  if (isNoValue(value)) {
    return
  }

  const descriptor = runtime.descriptor

  switch (descriptor.kind) {
    case 'text': {
      assertDoesNotReplaceOwnedSubtree(element, ownedSubtrees)

      if (element.textContent !== value) {
        element.textContent = /** @type {string} */ (value)
      }
      return
    }
    case 'property': {
      const name = /** @type {string} */ (descriptor.name)

      if (name === 'outerHTML' && element === planningRoot) {
        throw new TypeError(
          'Lumi cannot replace a mounted component root with outerHTML',
        )
      }

      if (isStructuralProperty(name)) {
        assertDoesNotReplaceOwnedSubtree(element, ownedSubtrees)
      }

      const previous = liveElement === undefined
        ? undefined
        : runtime.values.get(liveElement)

      if (
        isPropertyCurrent(
          Reflect.get(element, name),
          projectedCacheValue(runtime, value),
          previous,
        )
      ) {
        return
      }

      const parent = element.parentNode
      const previousSibling = element.previousSibling
      const nextSibling = element.nextSibling

      setProperty(element, name, value)

      if (name === 'innerHTML' || name === 'innerText') {
        markElementChildren(element, createdBy, creationHistory)
      } else if (name === 'outerHTML' && parent !== null) {
        markSiblingsBetween(
          parent,
          previousSibling,
          nextSibling,
          createdBy,
          creationHistory,
        )
      }
      return
    }
    case 'attribute': {
      setAttributeValue(
        element,
        /** @type {string} */ (descriptor.name),
        value,
      )
      return
    }
    case 'class': {
      runtime.apply(element, value)
      return
    }
    case 'style': {
      runtime.apply(element, value)
      return
    }
    case 'repeat':
      return
  }
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Element} element
 * @param {unknown} value
 * @returns {boolean} Whether the live DOM was changed.
 */
function applyLiveValue(runtime, element, value) {
  if (isNoValue(value)) {
    return false
  }

  return runtime.apply(element, value)
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 */
function setProperty(element, name, value) {
  if (!Reflect.set(element, name, value)) {
    throw new TypeError(
      `Lumi could not set property "${name}" on <${element.localName}>`,
    )
  }
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 * @returns {boolean} Whether the attribute was changed.
 */
function setAttributeValue(element, name, value) {
  const next = /** @type {string | false} */ (value)

  if (attributeValue(element, name) === next) {
    return false
  }

  if (next === false) {
    element.removeAttribute(name)
  } else {
    element.setAttribute(name, next)
  }

  return true
}

/**
 * @param {Element} element
 * @param {string} name
 * @returns {string | false} The attribute value, or false when it is absent.
 */
function attributeValue(element, name) {
  return element.hasAttribute(name)
    ? element.getAttribute(name) ?? ''
    : false
}

/**
 * Returns whether a property already holds the projected value, either
 * directly or as the value that the browser kept after the previous write.
 *
 * @param {unknown} current
 * @param {unknown} projectedValue
 * @param {CachedValue | undefined} previous
 * @returns {boolean}
 */
function isPropertyCurrent(current, projectedValue, previous) {
  return Object.is(current, projectedValue)
    || (
      previous !== undefined
      && Object.is(previous.projectedValue, projectedValue)
      && Object.is(previous.domValue, current)
    )
}

/**
 * @param {string} name
 * @returns {boolean} Whether the class token can be found in the raw
 *   attribute without a DOMTokenList.
 */
function isValidClassToken(name) {
  return name !== '' && !/[\t\n\f\r ]/.test(name)
}

/**
 * @param {string} name
 * @returns {RegExp} A pattern that finds each occurrence of one class token.
 */
function classTokenOccurrence(name) {
  return new RegExp(
    `(^|${classWhitespace})${escapeRegularExpression(name)}`
    + `(?=$|${classWhitespace})`,
    'g',
  )
}

/**
 * Adds one class token without parsing or serializing unrelated tokens.
 *
 * @param {string} current
 * @param {string} name
 * @returns {string}
 */
function appendClassToken(current, name) {
  if (current === '' || /[\t\n\f\r ]$/.test(current)) {
    return current + name
  }

  return `${current} ${name}`
}

/**
 * Escapes a fixed string for use in a regular expression.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Gets the CSSStyleDeclaration property for a standard CSS property name.
 * Custom properties and non-standard spellings use the CSSOM methods.
 *
 * @param {string} name
 * @returns {string | null}
 */
function styleProperty(name) {
  if (name.startsWith('--') || /[A-Z]/.test(name)) {
    return null
  }

  if (name === 'float') {
    return 'cssFloat'
  }

  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * @param {Element} element
 * @returns {HTMLElement | SVGElement}
 */
function asStyledElement(element) {
  if (!('style' in element)) {
    throw new TypeError(
      `Lumi style binding requires a styled element, received <${element.localName}>`,
    )
  }

  return /** @type {HTMLElement | SVGElement} */ (element)
}

/**
 * @param {Element} live
 * @param {Element} planned
 * @param {WeakMap<Element, Element>} liveByPlanned
 * @param {WeakMap<Element, Element>} plannedByLive
 */
function pairElementTrees(
  live,
  planned,
  liveByPlanned,
  plannedByLive,
) {
  liveByPlanned.set(planned, live)
  plannedByLive.set(live, planned)

  if (live.shadowRoot !== null && planned.shadowRoot !== null) {
    pairElementChildren(
      live.shadowRoot.children,
      planned.shadowRoot.children,
      liveByPlanned,
      plannedByLive,
    )
  }

  pairElementChildren(
    live.children,
    planned.children,
    liveByPlanned,
    plannedByLive,
  )
}

/**
 * @param {HTMLCollectionOf<Element>} liveChildren
 * @param {HTMLCollectionOf<Element>} plannedChildren
 * @param {WeakMap<Element, Element>} liveByPlanned
 * @param {WeakMap<Element, Element>} plannedByLive
 */
function pairElementChildren(
  liveChildren,
  plannedChildren,
  liveByPlanned,
  plannedByLive,
) {
  const length = Math.min(liveChildren.length, plannedChildren.length)

  for (let index = 0; index < length; index += 1) {
    const liveChild = liveChildren[index]
    const plannedChild = plannedChildren[index]

    if (liveChild !== undefined && plannedChild !== undefined) {
      pairElementTrees(
        liveChild,
        plannedChild,
        liveByPlanned,
        plannedByLive,
      )
    }
  }
}

/**
 * @param {Element} target
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function assertDoesNotReplaceOwnedSubtree(target, ownedSubtrees) {
  for (const owned of ownedSubtrees) {
    if (target === owned || target.contains(owned)) {
      throw new Error(
        'Lumi content binding cannot replace a child subtree',
      )
    }
  }
}

/**
 * @param {ParentNode} parent
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @param {ReadonlySet<number>} history
 */
function markElementChildren(parent, createdBy, history) {
  for (const child of parent.children) {
    markCreatedSubtree(child, createdBy, history)
  }
}

/**
 * @param {Node} parent
 * @param {ChildNode | null} previousSibling
 * @param {ChildNode | null} nextSibling
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @param {ReadonlySet<number>} history
 */
function markSiblingsBetween(
  parent,
  previousSibling,
  nextSibling,
  createdBy,
  history,
) {
  let current = previousSibling === null
    ? parent.firstChild
    : previousSibling.nextSibling

  while (current !== null && current !== nextSibling) {
    if (current.nodeType === 1) {
      markCreatedSubtree(
        /** @type {Element} */ (current),
        createdBy,
        history,
      )
    }
    current = current.nextSibling
  }
}

/**
 * @param {Element} element
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @param {ReadonlySet<number>} history
 */
function markCreatedSubtree(element, createdBy, history) {
  createdBy.set(element, history)

  for (const child of element.children) {
    markCreatedSubtree(child, createdBy, history)
  }
}

/**
 * @param {string} selector
 * @returns {Error}
 */
function changedDuringCommit(selector) {
  return new Error(
    `Lumi DOM changed while committing selector "${selector}"`,
  )
}

/**
 * Gets the policy factory from the mounted component's realm. Detached
 * planning documents have no Window, so the live root is the authoritative
 * realm for authenticating values used during both planning and commit.
 *
 * @param {Element} root
 * @returns {TrustedHTMLCheck | null}
 */
function trustedTypesFactory(root) {
  const view = root.ownerDocument.defaultView

  if (view === null) {
    return null
  }

  const factory = Reflect.get(view, 'trustedTypes')

  if (typeof factory !== 'object' || factory === null) {
    return null
  }

  const isHTML = Reflect.get(factory, 'isHTML')

  if (typeof isHTML !== 'function') {
    return null
  }

  return value => {
    return Reflect.apply(isHTML, factory, [value]) === true
  }
}

/**
 * @param {unknown} value
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @param {string} name
 */
function assertTrustedHTML(value, trustedTypes, name) {
  if (trustedTypes === null) {
    throw new TypeError(
      `Lumi property "${name}" requires TrustedHTML, `
      + 'but the mounted document does not expose the Trusted Types API',
    )
  }

  if (!trustedTypes(value)) {
    throw invalidProjectionValue(
      `property "${name}"`,
      'TrustedHTML',
      value,
    )
  }
}

/**
 * Describes a rejected projection value without coercing it.
 *
 * @param {unknown} value
 * @returns {string}
 */
function projectionValueType(value) {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'an array'
  }

  return `type ${typeof value}`
}

/**
 * Reports one recoverable value-domain mismatch per mounted declaration and
 * received category.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {unknown} value
 * @param {string} expected
 * @param {string} [category]
 */
function warnIgnored(runtime, value, expected, category) {
  const actual = category ?? projectionValueType(value)

  if (runtime.warnings.has(actual)) {
    return
  }

  runtime.warnings.add(actual)
  warn(
    `Lumi ${runtime.descriptor.kind} binding `
    + `"${runtime.descriptor.selector}" ignored ${actual}; expected `
    + `${expected}. The existing DOM state was preserved.`,
    runtime.view,
  )
}

/**
 * Reports once per mounted declaration that boolean `true` wrote an empty
 * ARIA attribute. The written value stays the documented boolean mapping.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 */
function warnAriaBoolean(runtime) {
  if (runtime.warnings.has('ARIA boolean true')) {
    return
  }

  runtime.warnings.add('ARIA boolean true')
  warn(
    `Lumi ${runtime.descriptor.kind} binding `
    + `"${runtime.descriptor.selector}" projected true into `
    + `"${runtime.descriptor.name}"; true writes an empty attribute, but `
    + 'ARIA states are string tokens. Project the string \'true\' or '
    + '\'false\' instead, for example String(value).',
    runtime.view,
  )
}

/**
 * @param {string} binding
 * @param {string} expected
 * @param {unknown} value
 * @returns {TypeError}
 */
function invalidProjectionValue(binding, expected, value) {
  return new TypeError(
    `Lumi ${binding} projection must return ${expected}; received ${projectionValueType(value)}`,
  )
}

/**
 * @param {unknown} value
 * @returns {value is TextValue}
 */
function isTextValue(value) {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
}
