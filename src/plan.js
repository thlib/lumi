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
  pairElementTrees,
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
const classWhitespace = '[\\t\\n\\f\\r ]'
const textValues = 'a string, number, or boolean'
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
  return /** @type {any} */ (binding)?.[domBindingDescriptor] ?? null
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
  return /** @type {any} */ (connected)[ownedDomSubtrees] ?? []
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
 * `apply` writes a value and tells whether the live DOM changed. `changes`
 * is a read-only check that tells whether applying one value to the current
 * DOM can change the result of a later selector resolution. Any attribute,
 * class token, property, or inline style write can do that. A text write
 * changes only text when the element keeps one non-empty text node, so only
 * a write that changes the element's child nodes otherwise (for example the
 * result of `:empty`) is a change.
 *
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @param {number} index
 * @param {Element} root
 * @returns {DomBindingRuntime<Data>}
 */
function createDomBindingRuntime(descriptor, index, root) {
  const name = /** @type {string} */ (descriptor.name)
  const requiresTrustedHTML = descriptor.kind === 'property'
    && (name === 'innerHTML' || name === 'outerHTML')
  /** @type {DomBindingRuntime<Data>} */
  const runtime = {
    descriptor,
    index,
    values: new WeakMap(),
    requiresTrustedHTML,
    warnings: new Set(),
    view: root.ownerDocument.defaultView,
    normalize: projected => projected,
    apply: () => false,
    changes: () => false,
  }

  switch (descriptor.kind) {
    case 'repeat':
      runtime.normalize = projected => {
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
      break
    case 'text':
      runtime.normalize = projected => {
        if (!isTextValue(projected)) {
          warnIgnored(runtime, projected, textValues)
          return noValue
        }
        return String(projected)
      }
      runtime.apply = (element, value) => {
        const text = /** @type {string} */ (value)
        const sink = /** @type {TextSink} */ (element)
        const written = sink[writtenText]

        if (written === text) {
          return false
        }

        sink[writtenText] = text

        // Without a remembered value, the element has its source content.
        // One read keeps the first update free of a redundant write.
        if (written === undefined && element.textContent === text) {
          return false
        }

        writeText(element, text)
        return true
      }
      runtime.changes = (element, value) => {
        if (/** @type {TextSink} */ (element)[writtenText] === value) {
          return false
        }

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
      break
    case 'property':
      if (requiresTrustedHTML) {
        runtime.normalize = (projected, trustedTypes) => {
          assertTrustedHTML(projected, trustedTypes, name)
          return projected
        }
      }
      runtime.apply = (element, value) => {
        const shouldWrite = runtime.changes(element, value)

        if (shouldWrite) {
          setProperty(element, name, value)

          if (isStructuralProperty(name)) {
            /** @type {TextSink} */ (element)[writtenText] = undefined
          }
        }

        runtime.values.set(element, {
          projectedValue: projectedCacheValue(runtime, value),
          domValue: /** @type {any} */ (element)[name],
        })
        return shouldWrite
      }
      runtime.changes = (element, value) => {
        return !isPropertyCurrent(
          /** @type {any} */ (element)[name],
          projectedCacheValue(runtime, value),
          runtime.values.get(element),
        )
      }
      break
    case 'attribute': {
      // Decided once per declaration so the update path pays one boolean test.
      const isAria = /^aria-/i.test(name)
      runtime.normalize = projected => {
        if (!isTextValue(projected)) {
          warnIgnored(runtime, projected, textValues)
          return noValue
        }
        if (isAria && projected === true) {
          warnOnce(
            runtime,
            'ARIA boolean true',
            `projected true into "${name}"; true writes an empty attribute, `
            + 'but ARIA states are string tokens. Project the string \'true\' '
            + 'or \'false\' instead, for example String(value).',
          )
        }
        return projected === false
          ? false
          : projected === true
            ? ''
            : String(projected)
      }
      useDomValue(
        runtime,
        element => attributeValue(element, name),
        (element, value) => {
          if (value === false) {
            element.removeAttribute(name)
          } else {
            element.setAttribute(name, value)
          }
        },
      )
      break
    }
    case 'class': {
      runtime.normalize = projected => {
        if (typeof projected !== 'boolean') {
          warnIgnored(runtime, projected, 'a boolean')
          return noValue
        }
        return projected
      }

      // Keep native DOMTokenList errors for invalid tokens. Valid fixed
      // tokens use the raw attribute so an update does not create and
      // search a DOMTokenList for all classes on the element.
      if (name === '' || /[\t\n\f\r ]/.test(name)) {
        useDomValue(
          runtime,
          element => element.classList.contains(name),
          (element, value) => element.classList.toggle(name, value),
        )
        break
      }

      const occurrence = new RegExp(
        `(^|${classWhitespace})${escapeRegularExpression(name)}`
        + `(?=$|${classWhitespace})`,
        'g',
      )
      useDomValue(
        runtime,
        element => (element.getAttribute('class') ?? '').search(occurrence) >= 0,
        (element, value) => {
          const current = element.getAttribute('class') ?? ''
          element.setAttribute(
            'class',
            !value
              ? current.replace(occurrence, '$1')
              : current === '' || /[\t\n\f\r ]$/.test(current)
                ? current + name
                : `${current} ${name}`,
          )
        },
      )
      break
    }
    case 'style': {
      runtime.normalize = projected => {
        if (typeof projected !== 'string') {
          warnIgnored(runtime, projected, 'a string')
          return noValue
        }
        return projected
      }

      // The CSSStyleDeclaration property for a standard CSS property name.
      // Custom properties and non-standard spellings use the CSSOM methods.
      const property = name.startsWith('--') || /[A-Z]/.test(name)
        ? null
        : name === 'float'
          ? 'cssFloat'
          : name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

      /**
       * @param {Element} element
       * @returns {Record<string, unknown> & CSSStyleDeclaration}
       */
      const styleOf = element => {
        if (!('style' in element)) {
          throw new TypeError(
            'Lumi style binding requires a styled element, '
            + `received <${element.localName}>`,
          )
        }

        return /** @type {Record<string, unknown> & CSSStyleDeclaration} */ (
          element.style
        )
      }

      useDomValue(
        runtime,
        element => {
          const style = styleOf(element)
          return property !== null && typeof style[property] === 'string'
            ? style[property]
            : style.getPropertyValue(name)
        },
        (element, value) => {
          const style = styleOf(element)

          if (property !== null && typeof style[property] === 'string') {
            style[property] = value
          } else if (value === '') {
            style.removeProperty(name)
          } else {
            style.setProperty(name, value)
          }
        },
      )
      break
    }
  }

  return runtime
}

/**
 * Sets `apply` and `changes` for a binding whose current DOM value can be
 * read and compared with the normalized value.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {(element: Element) => unknown} read
 * @param {(element: Element, value: any) => void} write
 */
function useDomValue(runtime, read, write) {
  runtime.apply = (element, value) => {
    if (read(element) === value) {
      return false
    }

    write(element, value)
    return true
  }
  runtime.changes = (element, value) => read(element) !== value
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
    const runtime = /** @type {DomBindingRuntime<Data>} */ (
      runtimes[runtimeIndex]
    )

    const elements = /** @type {ReadonlyArray<Element>} */ (elementsByRuntime[runtimeIndex])
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
        const element = /** @type {Element} */ (elements[index])

        if (values[index] !== unplannedMatch) {
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
    const runtime = /** @type {DomBindingRuntime<Data>} */ (
      runtimes[runtimeIndex]
    )

    if (!isStructuralBinding(runtime.descriptor)) {
      continue
    }

    const elements = /** @type {ReadonlyArray<Element>} */ (elementsByRuntime[runtimeIndex])

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = /** @type {Element} */ (elements[matchIndex])

      if (isHoistedContent(runtime, element)) {
        tasks.push({
          runtime,
          element,
          matchIndex,
          depth: elementDepth(root, element),
        })
      }
    }
  }

  // The tasks are in declaration and match order, and the sort is stable.
  if (tasks.length > 1) {
    tasks.sort((left, right) => left.depth - right.depth)
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
    const element = /** @type {Element} */ (elements[index])
    const value = values[index]

    if (
      value !== unplannedMatch
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
  pairElementTrees(root, planningRoot, (live, planned) => {
    liveByPlanned.set(planned, live)
    plannedByLive.set(live, planned)
  })
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
    const elements = /** @type {ReadonlyArray<Element>} */ (elementsByRuntime[operation.runtime.index])

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
    const runtime = /** @type {DomBindingRuntime<Data>} */ (
      runtimes[runtimeIndex]
    )

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
      const element = /** @type {Element} */ (elements[index])
      const value = values[index]

      if (value !== unplannedMatch) {
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
    const runtime = /** @type {DomBindingRuntime<Data>} */ (
      runtimes[runtimeIndex]
    )

    const elements = /** @type {ReadonlyArray<Element>} */ (elementsByRuntime[runtimeIndex])

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

        const single = operation.type === 'single'

        if (
          single
            ? elements[operation.matchIndex] === undefined
            : elements.length !== operation.values.length
        ) {
          throw new Error(
            'Lumi DOM changed while committing selector '
            + `"${operation.runtime.descriptor.selector}"`,
          )
        }

        const end = single ? operation.matchIndex + 1 : elements.length

        for (
          let index = single ? operation.matchIndex : 0;
          index < end;
          index += 1
        ) {
          const element = /** @type {Element} */ (elements[index])
          const value = single ? operation.value : operation.values[index]

          if (value !== unplannedMatch) {
            trackParentCache(
              parentCacheRecords,
              operation.runtime,
              element,
              value,
            )

            if (applyLiveValue(operation.runtime, element, value)) {
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
    const domValue = /** @type {any} */ (record.element)[
      /** @type {string} */ (descriptor.name)
    ]

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
      const element = /** @type {Element} */ (elements[matchIndex])

      if (
        processed?.has(element) === true
        || createdBy.get(element)?.has(runtime.index) === true
        || !isHoistedContent(runtime, element)
      ) {
        continue
      }

      const depth = elementDepth(root, element)

      // Declarations and matches are visited in ascending order, so only a
      // smaller depth can come before the selected task.
      if (selected === null || depth < selected.depth) {
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

      // The commit does not write a remembered value again, so the plan
      // must keep the same content.
      if (
        liveElement !== undefined
        && /** @type {TextSink} */ (liveElement)[writtenText] === value
      ) {
        return
      }

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
          /** @type {any} */ (element)[name],
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
    default:
      runtime.apply(element, value)
  }
}

/**
 * The key of the text that a `text` binding last gave to an element. A `text`
 * binding compares its projection with this value and does not read the live
 * DOM. The element holds the value, not the binding, so overlapping
 * declarations for one element see the writes of each other and the last
 * declaration wins. A symbol property on the element is faster than a
 * `WeakMap`, most of all when an update creates many elements.
 */
const writtenText = Symbol('lumi.text')

/** @typedef {Element & {[writtenText]?: string | undefined}} TextSink */

/**
 * Writes text and keeps the text node when the element has only that node.
 * An empty value removes all child nodes, as `textContent` does.
 *
 * @param {Element} element
 * @param {string} text
 */
function writeText(element, text) {
  const first = element.firstChild

  if (
    text !== ''
    && first !== null
    && first.nodeType === 3
    && first.nextSibling === null
  ) {
    /** @type {Text} */ (first).data = text
    return
  }

  element.textContent = text
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
 * Escapes a fixed string for use in a regular expression.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
 * Gets the policy factory from the mounted component's realm. Detached
 * planning documents have no Window, so the live root is the authoritative
 * realm for authenticating values used during both planning and commit.
 *
 * @param {Element} root
 * @returns {TrustedHTMLCheck | null}
 */
function trustedTypesFactory(root) {
  const factory = /** @type {any} */ (root.ownerDocument.defaultView)
    ?.trustedTypes
  const isHTML = factory?.isHTML

  return typeof isHTML === 'function'
    ? value => isHTML.call(factory, value) === true
    : null
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
function warnIgnored(
  runtime,
  value,
  expected,
  category = projectionValueType(value),
) {
  warnOnce(
    runtime,
    category,
    `ignored ${category}; expected ${expected}. `
    + 'The existing DOM state was preserved.',
  )
}

/**
 * Reports one diagnostic per mounted declaration and category.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {string} category
 * @param {string} message
 */
function warnOnce(runtime, category, message) {
  if (runtime.warnings.has(category)) {
    return
  }

  runtime.warnings.add(category)
  warn(
    `Lumi ${runtime.descriptor.kind} binding `
    + `"${runtime.descriptor.selector}" ${message}`,
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
