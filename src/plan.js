// @ts-check

/**
 * Package-internal DOM planning primitives. The supported package surface is
 * exported only from index.js.
 *
 * @internal
 */

import {
  createElementQuery,
  elementPath,
  importElementTree,
  queryElements,
  queryOwnedElements,
  shadowIncludingParent,
} from './dom.js'
import { connectCardinalityDomBindings } from './cardinality.js'
import {warn} from './internal/diagnostics.js'
import { isNoValue, noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {rootContext} from './internal/projection-context.js'

const domBindingDescriptor = Symbol('Lumi DOM binding descriptor')
const ownedDomSubtrees = Symbol('Lumi owned DOM subtrees')
const noOperation = () => {}
const classWhitespace = '[\\t\\n\\f\\r ]'

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
 * @typedef {object} TrustedTypesFactory
 * @property {(value: unknown) => boolean} isHTML
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
 * @property {unknown[]} replay
 * @property {boolean} requiresTrustedHTML
 * @property {Set<string>} warnings
 * @property {Window | null} view
 * @property {(projected: unknown, trustedTypes: TrustedTypesFactory | null) => unknown} normalize
 * @property {(element: Element, value: unknown) => boolean} apply
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
 * @returns {ReadonlyArray<DomBindingDescriptor<Data>>}
 */
export function flattenDomBindingDescriptors(descriptors, scope = undefined) {
  /** @type {Array<DomBindingDescriptor<Data>>} */
  const flattened = []

  for (const descriptor of descriptors) {
    const declaration = scope === undefined
      ? descriptor
      : {...descriptor, scope}

    flattened.push(declaration)

    if (descriptor.bindings !== undefined) {
      flattened.push(...flattenDomBindingDescriptors(
        descriptor.bindings,
        declaration,
      ))
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
    publishShadowRoots,
  )
  /** @type {ReturnType<typeof connectCardinalityDomBindings> | null} */
  let cardinality = runtimes.some(runtime => {
    return runtime.descriptor.kind === 'repeat'
  })
    ? createCardinality()
    : null

  function createCardinality() {
    return connectCardinalityDomBindings(
      root,
      blueprintRoot,
      /** @type {ReadonlyArray<import('./cardinality.js').Runtime>} */ (
        runtimes
      ),
      ownedSubtreePaths,
      (runtime, projected) => {
        const scalarRuntime = /** @type {DomBindingRuntime<Data>} */ (
          /** @type {unknown} */ (runtime)
        )
        return normalizeProjectedValue(
          scalarRuntime,
          projected,
          trustedTypes,
        )
      },
      (runtime, element, value) => {
        const scalarRuntime = /** @type {DomBindingRuntime<Data>} */ (
          /** @type {unknown} */ (runtime)
        )
        applyLiveValue(scalarRuntime, element, value)
      },
    )
  }

  return {
    prepare(data) {
      if (cardinality !== null) {
        return cardinality.prepare(data)
      }

      const prepared = scalar.prepare(data)
      clearProjectionReplay(runtimes)
      return prepared
    },

    destroy() {
      cardinality?.destroy()
      scalar.destroy()
    },
  }
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
    && isTrustedHTMLProperty(descriptor.name)
  /** @type {DomBindingRuntime<Data>} */
  const runtime = {
    descriptor,
    index,
    values: new WeakMap(),
    replay: [],
    requiresTrustedHTML,
    warnings: new Set(),
    view: root.ownerDocument.defaultView,
    normalize: () => noValue,
    apply: () => false,
  }

  runtime.normalize = createRuntimeNormalizer(runtime)
  runtime.apply = createRuntimeApply(runtime)
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

      const name = requiredName(descriptor)
      return (
        /** @type {unknown} */ projected,
        /** @type {TrustedTypesFactory | null} */ trustedTypes,
      ) => {
        assertTrustedHTML(projected, trustedTypes, name)
        return projected
      }
    }
    case 'attribute':
      return (/** @type {unknown} */ projected) => {
        if (!isTextValue(projected)) {
          warnIgnored(runtime, projected, 'a string, number, or boolean')
          return noValue
        }
        return projected === false
          ? false
          : projected === true
            ? ''
            : String(projected)
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
      const name = requiredName(descriptor)
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        const current = Reflect.get(element, name)
        const projectedValue = projectedCacheValue(runtime, value)
        const previous = runtime.values.get(element)

        const shouldWrite = (
          !Object.is(current, projectedValue)
          && !(
            previous !== undefined
            && Object.is(previous.projectedValue, projectedValue)
            && Object.is(previous.domValue, current)
          )
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
      const name = requiredName(descriptor)
      return (/** @type {Element} */ element, /** @type {unknown} */ value) => {
        return setAttributeValue(element, name, value)
      }
    }
    case 'class': {
      const name = requiredName(descriptor)
      const valid = name !== '' && !/[\t\n\f\r ]/.test(name)
      const token = escapeRegularExpression(name)
      const contains = new RegExp(
        `(^|${classWhitespace})${token}(?=$|${classWhitespace})`,
      )
      const remove = new RegExp(
        `(^|${classWhitespace})${token}(?=$|${classWhitespace})`,
        'g',
      )

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

        if (contains.test(current) === next) {
          return false
        }

        const className = next
          ? appendClassToken(current, name)
          : current.replace(remove, '$1')
        element.setAttribute('class', className)
        return true
      }
    }
    case 'style': {
      const name = requiredName(descriptor)
      const property = supportsStyleProperty(runtime.view, name)
        ? styleProperty(name)
        : null

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

  return {
    prepare(data) {
      const liveQuery = createElementQuery(root)
      const staging = analyzeStaging(
        root,
        runtimes,
        ownedSubtrees,
        liveQuery,
      )

      if (!staging.required) {
        return prepareDirectUpdate(
          root,
          runtimes,
          ownedSubtrees,
          staging.elementsByRuntime,
          data,
          trustedTypes,
          liveQuery,
          publishShadowRoots,
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

      return preparedDomUpdate(
        root,
        operations,
        ownedSubtrees,
        liveQuery,
        publishShadowRoots,
      )
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
 * @param {ElementQuery} liveQuery
 * @param {(roots: ReadonlySet<ShadowRoot>) => void} [publishShadowRoots]
 * @returns {import('./types.js').PreparedUpdate}
 */
function prepareDirectUpdate(
  root,
  runtimes,
  ownedSubtrees,
  elementsByRuntime,
  data,
  trustedTypes,
  liveQuery,
  publishShadowRoots,
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

  return preparedDomUpdate(
    root,
    operations,
    ownedSubtrees,
    liveQuery,
    publishShadowRoots,
  )
}

/**
 * Staging is needed only when a content write can change another binding's
 * targets or cross a nested component ownership boundary.
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
  let hasMatchedStructure = false

  /** @type {Map<Element, Set<number>>} */
  const structuralRuntimeIndexesByElement = new Map()

  for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
    const runtime = runtimes[runtimeIndex]

    if (runtime === undefined || !isStructural(runtime.descriptor)) {
      continue
    }

    const structuralElements = elementsByRuntime[runtimeIndex] ?? []

    if (structuralElements.length > 0) {
      hasMatchedStructure = true
    }

    for (const element of structuralElements) {
      let indexes = structuralRuntimeIndexesByElement.get(element)

      if (indexes === undefined) {
        indexes = new Set()
        structuralRuntimeIndexesByElement.set(element, indexes)
      }

      indexes.add(runtimeIndex)
    }
  }

  // A structural target cannot replace a child binding's owned subtree.
  // Walking upward from each owned root avoids comparing every structural
  // target with every owned subtree.
  for (const owned of ownedSubtrees) {
    let current = /** @type {Element | null} */ (owned)

    while (current !== null) {
      if (structuralRuntimeIndexesByElement.has(current)) {
        return { required: true, elementsByRuntime }
      }

      current = current.parentElement
    }
  }

  /** @type {Map<Element, Set<number>>} */
  const runtimeIndexesByElement = new Map()

  for (let runtimeIndex = 0; runtimeIndex < runtimes.length; runtimeIndex += 1) {
    for (const element of elementsByRuntime[runtimeIndex] ?? []) {
      let indexes = runtimeIndexesByElement.get(element)

      if (indexes === undefined) {
        indexes = new Set()
        runtimeIndexesByElement.set(element, indexes)
      }

      indexes.add(runtimeIndex)
    }
  }

  // Walk each distinct match toward its tree root. This preserves the exact
  // contains() relationship used by the former nested search, including its
  // deliberate separation at ShadowRoot boundaries, while avoiding a full
  // structural-target × matched-element comparison.
  for (const [element, matchingRuntimeIndexes] of runtimeIndexesByElement) {
    let current = /** @type {Element | null} */ (element)

    while (current !== null) {
      const structuralRuntimeIndexes =
        structuralRuntimeIndexesByElement.get(current)

      if (structuralRuntimeIndexes !== undefined) {
        if (current !== element) {
          return { required: true, elementsByRuntime }
        }

        // A declaration does not depend on itself at one target. Any other
        // declaration at the same element is a real ordered dependency.
        if (
          structuralRuntimeIndexes.size !== 1
          || matchingRuntimeIndexes.size !== 1
          || !matchingRuntimeIndexes.has(
            /** @type {number} */ (
              structuralRuntimeIndexes.values().next().value
            ),
          )
        ) {
          return { required: true, elementsByRuntime }
        }
      }

      current = current.parentElement
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

          if (element !== undefined) {
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

    const runtime = record.runtime
    const descriptor = runtime.descriptor
    const domValue = Reflect.get(record.element, requiredName(descriptor))

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
function ownsElementContent(descriptor) {
  return descriptor.kind === 'text'
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
  return descriptor.kind === 'repeat'
    || descriptor.kind === 'text'
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
 * @param {TrustedTypesFactory | null} trustedTypes
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

  runtime.replay[matchIndex] = projected

  return normalizeProjectedValue(runtime, projected, trustedTypes)
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {unknown} projected
 * @param {TrustedTypesFactory | null} trustedTypes
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
      const projectedValue = projectedCacheValue(runtime, value)
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
  const current = element.hasAttribute(name)
    ? element.getAttribute(name) ?? ''
    : false

  if (current === next) {
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
 * Tests a CSS property name without assuming that the DOM types expose the
 * CSS namespace.
 *
 * @param {Window | null} view
 * @param {string} name
 * @returns {boolean}
 */
function supportsStyleProperty(view, name) {
  if (view === null) {
    return false
  }

  const css = Reflect.get(view, 'CSS')
  const supports = css === null || css === undefined
    ? undefined
    : Reflect.get(css, 'supports')

  return typeof supports === 'function'
    && Reflect.apply(supports, css, [name, 'initial']) === true
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
