// @ts-check

/**
 * Package-internal DOM planning primitives. The supported package surface is
 * exported only from index.js.
 *
 * @internal
 */

import {
  elementPath,
  importElementTree,
  queryElements,
  shadowIncludingContains,
  shadowIncludingParent,
} from './dom.js'
import { connectCardinalityDomBindings } from './cardinality.js'
import { isNoValue, noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'

const domBindingDescriptor = Symbol('Lumi DOM binding descriptor')
const ownedDomSubtrees = Symbol('Lumi owned DOM subtrees')
const noOperation = () => {}

class CardinalityRequired extends Error {
  /** @param {string} selector */
  constructor(selector) {
    super()
    this.selector = selector
  }
}

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * The Trusted Types capability Lumi needs to authenticate TrustedHTML.
 * Some TypeScript DOM libraries do not yet declare this browser API.
 *
 * @typedef {object} TrustedTypesFactory
 * @property {(value: unknown) => boolean} isHTML
 */

/**
 * @typedef {'bind' | 'property' | 'attribute' | 'class' | 'style'} DomBindingKind
 */

/**
 * @template Data
 * @typedef {object} DomBindingDescriptor
 * @property {DomBindingKind} kind
 * @property {string} selector
 * @property {(data: Data, element: Element) => unknown} project
 * @property {string} [name]
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
 * @property {unknown[]} replay
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
      return connectDomBindings(root, [descriptor])
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
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function connectDomBindings(root, descriptors, ownedSubtrees = []) {
  const trustedTypes = trustedTypesFactory(root)
  /** @type {Array<DomBindingRuntime<Data>>} */
  const runtimes = descriptors.map((descriptor, index) => ({
    descriptor,
    index,
    values: new WeakMap(),
    replay: [],
  }))
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
  const scalar = connectScalarDomBindings(
    root,
    runtimes,
    ownedSubtrees,
    trustedTypes,
  )
  /** @type {ReturnType<typeof connectCardinalityDomBindings> | null} */
  let cardinality = null

  return {
    prepare(data) {
      if (cardinality !== null) {
        return cardinality.prepare(data)
      }

      try {
        const prepared = scalar.prepare(data)
        clearProjectionReplay(runtimes)
        return prepared
      } catch (error) {
        if (!(error instanceof CardinalityRequired)) {
          clearProjectionReplay(runtimes)
          throw error
        }

        try {
          if (queryElements(blueprintRoot, error.selector).length === 0) {
            throw new TypeError(
              `Lumi array bind selector "${error.selector}" must match the component template`,
            )
          }

          const candidate = connectCardinalityDomBindings(
            root,
            blueprintRoot,
            /** @type {ReadonlyArray<import('./cardinality.js').Runtime>} */ (
              runtimes
            ),
            ownedSubtreePaths,
            (runtime, projected) => {
              return normalizeProjectedValue(
                runtime.descriptor,
                projected,
                trustedTypes,
              )
            },
            (runtime, element, value) => {
              applyLiveValue(runtime, element, value)
            },
          )

          try {
            const prepared = candidate.prepare(data)
            cardinality = candidate
            return prepared
          } catch (cardinalityError) {
            candidate.destroy()
            throw cardinalityError
          }
        } finally {
          clearProjectionReplay(runtimes)
        }
      }
    },

    destroy() {
      cardinality?.destroy()
      scalar.destroy()
    },
  }
}

/**
 * Promotion replay belongs only to one preparation attempt. Clearing it on
 * every exit prevents a later snapshot from observing stale projected data.
 *
 * @template Data
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 */
function clearProjectionReplay(runtimes) {
  for (const runtime of runtimes) {
    runtime.replay.length = 0
  }
}

/**
 * Connects the existing one-value-per-match planner.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {TrustedTypesFactory | null} trustedTypes
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
function connectScalarDomBindings(
  root,
  runtimes,
  ownedSubtrees,
  trustedTypes,
) {

  return {
    prepare(data) {
      const staging = analyzeStaging(root, runtimes, ownedSubtrees)

      if (!staging.required) {
        return prepareDirectUpdate(
          root,
          runtimes,
          ownedSubtrees,
          staging.elementsByRuntime,
          data,
          trustedTypes,
        )
      }

      // Import into a document without a browsing context or custom-element
      // registry. Unlike cloneNode() in the live document, this cannot invoke
      // custom-element constructors merely to prepare an update.
      const planningDocument = root.ownerDocument.implementation
        .createHTMLDocument()
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

      /** @type {Map<DomBindingRuntime<Data>, WeakSet<Element>>} */
      const processedByRuntime = new Map()
      /** @type {WeakMap<Element, ReadonlySet<number>>} */
      const createdBy = new WeakMap()
      /** @type {Array<DomOperation<Data>>} */
      const operations = []

      for (const runtime of runtimes) {
        if (isStructural(runtime.descriptor)) {
          processedByRuntime.set(runtime, new WeakSet())
        }
      }

      while (true) {
        const task = nextStructuralTask(
          planningRoot,
          runtimes,
          processedByRuntime,
          createdBy,
          plannedOwnedSubtrees,
        )

        if (task === null) {
          break
        }

        processedByRuntime.get(task.runtime)?.add(task.element)

        const value = projectValue(
          task.runtime,
          data,
          task.element,
          task.matchIndex,
          trustedTypes,
        )
        const creationHistory = new Set(
          createdBy.get(task.element) ?? [],
        )
        creationHistory.add(task.runtime.index)

        applyPlannedValue(
          task.runtime,
          task.element,
          value,
          planningRoot,
          liveByPlanned.get(task.element),
          createdBy,
          creationHistory,
          plannedOwnedSubtrees,
        )
        operations.push({
          type: 'single',
          runtime: task.runtime,
          matchIndex: task.matchIndex,
          value,
        })
      }

      for (const runtime of runtimes) {
        if (isStructural(runtime.descriptor)) {
          continue
        }

        const elements = queryOwnedElements(
          planningRoot,
          runtime.descriptor.selector,
          plannedOwnedSubtrees,
        )
        const values = elements.map((element, matchIndex) => {
          return projectValue(
            runtime,
            data,
            element,
            matchIndex,
            trustedTypes,
          )
        })

        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index]

          if (element !== undefined) {
            applyPlannedValue(
              runtime,
              element,
              values[index],
              planningRoot,
              liveByPlanned.get(element),
              createdBy,
              new Set(),
              plannedOwnedSubtrees,
            )
          }
        }

        if (values.length > 0) {
          operations.push({
            type: 'batch',
            runtime,
            values,
          })
        }
      }

      return preparedDomUpdate(root, operations, ownedSubtrees)
    },

    destroy: noOperation,
  }
}

/**
 * Uses the live tree as a read-only preparation view when no structural rule
 * can invalidate another rule's targets.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ReadonlyArray<ReadonlyArray<Element>>} elementsByRuntime
 * @param {Data} data
 * @param {TrustedTypesFactory | null} trustedTypes
 * @returns {import('./types.js').PreparedUpdate}
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

  for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined) {
      continue
    }

    const elements = elementsByRuntime[runtimeIndex] ?? []
    const values = elements.map((element, matchIndex) => {
      return projectValue(
        runtime,
        data,
        element,
        matchIndex,
        trustedTypes,
      )
    })

    if (isStructural(runtime.descriptor)) {
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index]

        if (element !== undefined) {
          validateDirectStructuralTarget(
            runtime,
            element,
            root,
            ownedSubtrees,
          )
        }
      }
    }

    if (values.length > 0) {
      operations.push({
        type: 'batch',
        runtime,
        values,
      })
    }
  }

  return preparedDomUpdate(root, operations, ownedSubtrees)
}

/**
 * Staging is needed only when a content write can change another binding's
 * targets or cross a nested component ownership boundary.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {{
 *   required: boolean,
 *   elementsByRuntime: ReadonlyArray<ReadonlyArray<Element>>
 * }}
 */
function analyzeStaging(root, runtimes, ownedSubtrees) {
  const elementsByRuntime = runtimes.map(runtime => {
    return queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
    )
  })
  let hasMatchedStructure = false

  for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined || !isStructural(runtime.descriptor)) {
      continue
    }

    const structuralElements = elementsByRuntime[runtimeIndex] ?? []

    if (structuralElements.length > 0) {
      hasMatchedStructure = true
    }

    for (const target of structuralElements) {
      if (
        ownedSubtrees.some(owned => {
          return target === owned || target.contains(owned)
        })
      ) {
        return { required: true, elementsByRuntime }
      }

      for (
        let otherRuntimeIndex = 0;
        otherRuntimeIndex < elementsByRuntime.length;
        otherRuntimeIndex += 1
      ) {
        const otherElements = elementsByRuntime[otherRuntimeIndex] ?? []

        for (const other of otherElements) {
          if (
            runtimeIndex === otherRuntimeIndex
            && target === other
          ) {
            continue
          }

          if (target.contains(other)) {
            return { required: true, elementsByRuntime }
          }
        }
      }
    }
  }

  return {
    required: hasMatchedStructure
      && elementsByRuntime.some(elements => elements.length === 0),
    elementsByRuntime,
  }
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
 * @returns {import('./types.js').PreparedUpdate}
 */
function preparedDomUpdate(root, operations, ownedSubtrees) {
  return {
    commit() {
      /** @type {Array<ParentCacheRecord<Data>>} */
      const parentCacheRecords = []

      for (const operation of operations) {
        const elements = queryOwnedElements(
          root,
          operation.runtime.descriptor.selector,
          ownedSubtrees,
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
          applyLiveValue(
            operation.runtime,
            element,
            operation.value,
          )
          continue
        }

        if (elements.length !== operation.values.length) {
          throw changedDuringCommit(
            operation.runtime.descriptor.selector,
          )
        }

        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index]

          if (element !== undefined) {
            trackParentCache(
              parentCacheRecords,
              operation.runtime,
              element,
              operation.values[index],
            )
            applyLiveValue(
              operation.runtime,
              element,
              operation.values[index],
            )
          }
        }
      }

      refreshParentCaches(parentCacheRecords)
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
      if (ownsElementContent(runtime.descriptor)) {
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

    const descriptor = record.runtime.descriptor
    const domValue = Reflect.get(record.element, requiredName(descriptor))

    record.runtime.values.set(record.element, {
      projectedValue: projectedCacheValue(descriptor, record.value),
      domValue,
    })
  }
}

/**
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @returns {boolean}
 */
function ownsElementContent(descriptor) {
  return descriptor.kind === 'bind'
    || (
      descriptor.kind === 'property'
      && isStructuralProperty(descriptor.name)
    )
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
) {
  /** @type {{
   *   runtime: DomBindingRuntime<Data>,
   *   element: Element,
   *   matchIndex: number,
   *   depth: number
   * } | null} */
  let selected = null

  for (const runtime of runtimes) {
    if (!isStructural(runtime.descriptor)) {
      continue
    }

    const processed = processedByRuntime.get(runtime)
    const elements = queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
    )

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = elements[matchIndex]

      if (
        element === undefined
        || processed?.has(element) === true
        || createdBy.get(element)?.has(runtime.index) === true
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
 * @param {Element} root
 * @param {Element} element
 * @returns {number}
 */
function elementDepth(root, element) {
  let depth = 0
  let current = element

  while (current !== root) {
    const parent = shadowIncludingParent(current)

    if (parent === null) {
      throw new Error('Lumi lost a planned DOM target')
    }

    current = parent
    depth += 1
  }

  return depth
}

/**
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @returns {boolean}
 */
function isStructural(descriptor) {
  return descriptor.kind === 'bind'
    || (
      descriptor.kind === 'property'
      && isStructuralProperty(descriptor.name)
    )
}

/**
 * @param {string | undefined} name
 * @returns {boolean}
 */
function isStructuralProperty(name) {
  return name === 'innerHTML'
    || name === 'outerHTML'
    || name === 'textContent'
    || name === 'innerText'
}

/**
 * @param {string | undefined} name
 * @returns {boolean}
 */
function isTrustedHTMLProperty(name) {
  return name === 'innerHTML' || name === 'outerHTML'
}

/**
 * Keeps the authenticated TrustedHTML object intact for the native setter,
 * while comparing its immutable string data with the DOM's serialized value.
 *
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @param {unknown} value
 * @returns {unknown}
 */
function projectedCacheValue(descriptor, value) {
  return (
    descriptor.kind === 'property'
    && isTrustedHTMLProperty(descriptor.name)
  )
    ? String(value)
    : value
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Data} data
 * @param {Element} element
 * @param {number} matchIndex
 * @param {TrustedTypesFactory | null} trustedTypes
 * @returns {unknown}
 */
function projectValue(runtime, data, element, matchIndex, trustedTypes) {
  const descriptor = runtime.descriptor
  let projected

  try {
    projected = descriptor.project(data, element)
  } catch (error) {
    throw projectionError(descriptor, matchIndex, error)
  }

  runtime.replay[matchIndex] = projected

  if (descriptor.kind === 'bind' && Array.isArray(projected)) {
    throw new CardinalityRequired(descriptor.selector)
  }

  return normalizeProjectedValue(descriptor, projected, trustedTypes)
}

/**
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @param {unknown} projected
 * @param {TrustedTypesFactory | null} trustedTypes
 * @returns {unknown}
 */
function normalizeProjectedValue(descriptor, projected, trustedTypes) {
  if (projected === null || projected === undefined) {
    return noValue
  }

  switch (descriptor.kind) {
    case 'bind':
      assertTextValue(projected, 'bind')
      return String(projected)
    case 'property': {
      const name = requiredName(descriptor)

      if (isTrustedHTMLProperty(name)) {
        assertTrustedHTML(projected, trustedTypes, name)
      }
      return projected
    }
    case 'attribute':
      assertTextValue(projected, 'attribute')
      return projected === false
        ? false
        : projected === true
          ? ''
          : String(projected)
    case 'class':
      assertBooleanValue(projected, 'classToggle')
      return projected
    case 'style':
      assertStringValue(projected, 'style')
      return projected
  }
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
    case 'bind': {
      assertDoesNotReplaceOwnedSubtree(element, ownedSubtrees)

      if (element.textContent !== value) {
        element.textContent = /** @type {string} */ (value)
      }
      return
    }
    case 'property': {
      const name = requiredName(descriptor)

      if (name === 'outerHTML' && element === planningRoot) {
        throw new TypeError(
          'Lumi cannot replace a mounted component root with outerHTML',
        )
      }

      if (isStructuralProperty(name)) {
        assertDoesNotReplaceOwnedSubtree(element, ownedSubtrees)
      }

      const current = Reflect.get(element, name)
      const projectedValue = projectedCacheValue(descriptor, value)
      const previous = liveElement === undefined
        ? undefined
        : runtime.values.get(liveElement)

      if (
        Object.is(current, projectedValue)
        || (
          previous !== undefined
          && Object.is(previous.projectedValue, projectedValue)
          && Object.is(previous.domValue, current)
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
      setAttributeValue(element, requiredName(descriptor), value)
      return
    }
    case 'class': {
      element.classList.toggle(
        requiredName(descriptor),
        /** @type {boolean} */ (value),
      )
      return
    }
    case 'style': {
      const styledElement = asStyledElement(element)
      const name = requiredName(descriptor)

      if (value === '') {
        styledElement.style.removeProperty(name)
      } else {
        styledElement.style.setProperty(name, /** @type {string} */ (value))
      }
    }
  }
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {Element} element
 * @param {unknown} value
 */
function applyLiveValue(runtime, element, value) {
  if (isNoValue(value)) {
    return
  }

  const descriptor = runtime.descriptor

  switch (descriptor.kind) {
    case 'bind':
      if (element.textContent !== value) {
        element.textContent = /** @type {string} */ (value)
      }
      return
    case 'property': {
      const name = requiredName(descriptor)
      const current = Reflect.get(element, name)
      const projectedValue = projectedCacheValue(descriptor, value)
      const previous = runtime.values.get(element)

      if (
        !Object.is(current, projectedValue)
        && !(
          previous !== undefined
          && Object.is(previous.projectedValue, projectedValue)
          && Object.is(previous.domValue, current)
        )
      ) {
        setProperty(element, name, value)
      }

      runtime.values.set(element, {
        projectedValue,
        domValue: Reflect.get(element, name),
      })
      return
    }
    case 'attribute':
      setAttributeValue(element, requiredName(descriptor), value)
      return
    case 'class':
      element.classList.toggle(
        requiredName(descriptor),
        /** @type {boolean} */ (value),
      )
      return
    case 'style': {
      const styledElement = asStyledElement(element)
      const name = requiredName(descriptor)
      const current = styledElement.style.getPropertyValue(name)

      if (current === value) {
        return
      }

      if (value === '') {
        styledElement.style.removeProperty(name)
      } else {
        styledElement.style.setProperty(name, /** @type {string} */ (value))
      }
    }
  }
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
 */
function setAttributeValue(element, name, value) {
  const next = /** @type {string | false} */ (value)
  const current = element.hasAttribute(name)
    ? element.getAttribute(name) ?? ''
    : false

  if (current === next) {
    return
  }

  if (next === false) {
    element.removeAttribute(name)
  } else {
    element.setAttribute(name, next)
  }
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
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @returns {string}
 */
function requiredName(descriptor) {
  if (descriptor.name === undefined) {
    throw new Error(`Lumi ${descriptor.kind} binding lost its name`)
  }

  return descriptor.name
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
 * Resolves a selector without crossing child component boundaries.
 * The owning container itself remains available for non-structural bindings.
 *
 * @param {Element} root
 * @param {string} selector
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
function queryOwnedElements(root, selector, ownedSubtrees) {
  return queryElements(root, selector).filter(element => {
    return !ownedSubtrees.some(owned => {
      return owned !== element
        && shadowIncludingContains(owned, element)
    })
  })
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
 * @returns {TrustedTypesFactory | null}
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

  return {
    isHTML(value) {
      return Reflect.apply(isHTML, factory, [value]) === true
    },
  }
}

/**
 * @param {unknown} value
 * @param {TrustedTypesFactory | null} trustedTypes
 * @param {string} name
 */
function assertTrustedHTML(value, trustedTypes, name) {
  if (trustedTypes === null) {
    throw new TypeError(
      `Lumi property "${name}" requires TrustedHTML, `
      + 'but the mounted document does not expose the Trusted Types API',
    )
  }

  if (!trustedTypes.isHTML(value)) {
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
 * @param {string} binding
 * @returns {asserts value is TextValue}
 */
function assertTextValue(value, binding) {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'boolean'
  ) {
    throw invalidProjectionValue(
      binding,
      'a string, number, or boolean',
      value,
    )
  }
}

/**
 * @param {unknown} value
 * @param {string} binding
 * @returns {asserts value is string}
 */
function assertStringValue(value, binding) {
  if (typeof value !== 'string') {
    throw invalidProjectionValue(binding, 'a string', value)
  }
}

/**
 * @param {unknown} value
 * @param {string} binding
 * @returns {asserts value is boolean}
 */
function assertBooleanValue(value, binding) {
  if (typeof value !== 'boolean') {
    throw invalidProjectionValue(binding, 'a boolean', value)
  }
}
