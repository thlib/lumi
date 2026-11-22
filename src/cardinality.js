// @ts-check

/**
 * Package-internal positional-cardinality planner. The supported package
 * surface is exported only from index.js.
 *
 * @internal
 */

import {
  containsOpenShadowRoot,
  createLocator,
  elementAtPath,
  elementPath,
  importElementTree,
  locateElements,
  markCreated,
  queryOwnedElements,
  shadowIncludingContains,
  shadowIncludingParent,
  tasksByDepth,
} from './dom.js'
import { noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {itemContext, rootContext} from './internal/projection-context.js'
import {isStructuralBinding} from './internal/structural.js'

/**
 * @typedef {object} Runtime
 * @property {{
 *   kind: 'repeat' | 'text' | 'property' | 'attribute' | 'class' | 'style',
 *   selector: string,
 *   project: (input: unknown, el: Element) => unknown,
 *   key?: ((input: unknown) => unknown) | undefined,
 *   name?: string,
 *   scope?: Runtime['descriptor']
 * }} descriptor
 * @property {number} index
 * @property {Runtime | undefined} [scope] The repeat declaration that owns
 * this declaration. A declaration at the component boundary has none.
 * @property {WeakMap<Element, {
 *   projectedValue: unknown,
 *   domValue: unknown
 * }>} values
 * @property {(projected: unknown) => unknown} normalize
 * @property {(element: Element, value: unknown) => boolean} apply
 */

/**
 * @typedef {object} SinkSpec
 * @property {Runtime} runtime
 * @property {Element} target
 * @property {number} matchIndex
 * @property {number[]} path
 */

/**
 * @typedef {object} ScopeSpec
 * @property {SinkSpec[]} sinks
 * @property {RegionSpec[]} regions
 * @property {import('./dom.js').Locator} locator Finds the sink elements,
 * then the repeat targets, below the element of the scope.
 */

/**
 * @typedef {object} RegionSpec
 * @property {Runtime} runtime
 * @property {Element} target
 * @property {number} matchIndex
 * @property {number[]} path
 * @property {SinkSpec[]} ownSinks
 * @property {ScopeSpec} scope
 * @property {ReadonlyArray<unknown> | null} acceptedKeys The keys of the
 * last item list that passed the duplicate check.
 * @property {boolean} hasOpenShadowRoot Whether the target contains an open
 * shadow root. The target is in the blueprint, which does not change.
 * @property {boolean} keepsContexts Whether a plan keeps the context of each
 * occurrence. Only dynamic planning reads the contexts.
 */

/**
 * The plan of the component boundary: one prepared value for each sink
 * spec and one plan for each region spec, at the same index.
 *
 * @typedef {object} ScopePlan
 * @property {ReadonlyArray<unknown>} sinks
 * @property {ReadonlyArray<RegionPlan>} regions
 */

/**
 * The plan of all occurrences of one region. A plan holds no object for
 * each occurrence or each sink: the values of all occurrences are in one
 * array, so an update creates few objects.
 *
 * @typedef {object} RegionPlan
 * @property {RegionSpec} spec
 * @property {number} count The number of occurrences.
 * @property {ReadonlyArray<unknown> | null} keys The key of each occurrence,
 * or null for a repeat without a key projection.
 * @property {ReadonlyArray<import('./types.js').ProjectionContext<unknown, unknown>> | null} contexts
 * The context of each occurrence, when the spec keeps contexts.
 * @property {ReadonlyArray<unknown>} values The prepared values. Each
 * occurrence has the values of the own sinks, then the values of the sinks
 * in its scope.
 * @property {ReadonlyArray<RegionPlan>} regions The plans of the nested
 * regions: for each occurrence, one plan for each region in its scope.
 * @property {boolean} isNoop Whether the projection asked for no operation.
 */

/**
 * @typedef {(runtime: Runtime, element: Element, value: unknown) => void} ApplyValue
 */

/**
 * @typedef {object} DynamicOperation
 * @property {Runtime} runtime
 * @property {number} matchIndex
 * @property {number} matchCount
 * @property {unknown} value
 */

/**
 * Creates the explicit-repeat DOM planner.
 *
 * The renderer knows only ordinary JavaScript values. Projection syntax and
 * data lookup conventions remain application concerns.
 *
 * @param {Element} root
 * @param {Element} blueprintRoot
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 */
export function connectCardinalityDomBindings(
  root,
  blueprintRoot,
  runtimes,
  ownedSubtreePaths,
) {
  const runtimeByDescriptor = new Map(
    runtimes.map(runtime => [runtime.descriptor, runtime]),
  )

  // A declaration in the binding list of a repeat resolves its selector in
  // the occurrences of that repeat only.
  for (const runtime of runtimes) {
    const owner = runtime.descriptor.scope

    if (owner !== undefined) {
      runtime.scope = runtimeByDescriptor.get(owner)
    }
  }

  const needsDynamicPlanning = runtimes.some(runtime => {
    return canCreateTargets(runtime.descriptor)
  })
  const scope = compileScope(
    blueprintRoot,
    runtimes,
    ownedSubtreePaths.map(path => elementAtPath(blueprintRoot, path)),
    needsDynamicPlanning,
  )
  /** @type {ScopeState | null} */
  let state = null

  return {
    prepare(/** @type {unknown} */ data) {
      const plan = prepareScope(scope, rootContext(data))
      const dynamicOperations = needsDynamicPlanning
        ? prepareDynamicOperations(
          blueprintRoot,
          scope,
          plan,
          runtimes,
          ownedSubtreePaths,
          data,
        )
        : []
      return {
        commit() {
          if (state === null) {
            state = new ScopeState(root)
            state.connect(scope)
          }

          state.apply(scope, applyLive, plan.sinks, 0, plan.regions, 0)
          commitDynamicOperations(
            root,
            dynamicOperations,
            runtimes,
            ownedSubtreePaths,
          )
        },
      }
    },

    destroy() {
      state?.destroy()
      state = null
    },
  }
}

/**
 * Writes one prepared value to its element.
 *
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {unknown} value
 */
function applyLive(runtime, element, value) {
  if (value !== noValue) {
    runtime.apply(element, value)
  }
}

/**
 * Compiles static template locations into nested positional regions.
 *
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {boolean} keepsContexts
 * @returns {ScopeSpec}
 */
function compileScope(root, runtimes, ownedSubtrees, keepsContexts) {
  /** @type {Map<Element, RegionSpec>} */
  const regionByTarget = new Map()
  /** @returns {ScopeSpec} */
  const createScope = () => {
    return { sinks: [], regions: [], locator: createLocator([]) }
  }
  const rootScope = createScope()

  for (const runtime of runtimes) {
    if (runtime.descriptor.kind !== 'repeat') {
      continue
    }

    const targets = queryRuntimeElements(root, runtime, ownedSubtrees)

    if (targets.length === 0) {
      throw new TypeError(
        `Lumi repeat selector "${runtime.descriptor.selector}" must match `
        + 'the component source',
      )
    }

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])

      if (target === root) {
        throw new TypeError(
          'Lumi cannot repeat a mounted component root',
        )
      }

      if (ownedSubtrees.some(owned => target.contains(owned))) {
        throw new Error(
          'Lumi repeat cannot replace a child subtree',
        )
      }

      // The last repeat declaration owns cardinality for this template
      // location.
      regionByTarget.set(target, {
        runtime,
        target,
        matchIndex,
        path: [],
        ownSinks: [],
        scope: createScope(),
        acceptedKeys: null,
        hasOpenShadowRoot: containsOpenShadowRoot(target),
        keepsContexts,
      })
    }
  }

  // The regions of each scope are in document order.
  const regions = [...regionByTarget.values()].sort((left, right) => {
    const following = 4
    return left.target.compareDocumentPosition(right.target) & following
      ? -1
      : 1
  })

  /**
   * Finds the region whose occurrences contain a target. A declaration in
   * the binding list of a repeat must be in a region of that repeat.
   *
   * @param {Runtime} runtime
   * @param {Element} target
   * @param {boolean} strict
   */
  const parentRegion = (runtime, target, strict) => {
    const parent = nearestRegion(target, regions, strict, runtime.scope)

    if (runtime.scope !== undefined && parent === null) {
      throw new Error('Lumi repeat binding escaped its owning repeat')
    }

    return parent
  }

  for (const region of regions) {
    const parent = parentRegion(region.runtime, region.target, true)

    region.path = elementPath(parent?.target ?? root, region.target)
    ;(parent?.scope ?? rootScope).regions.push(region)
  }

  // The sinks of each scope are in declaration order.
  for (const runtime of runtimes) {
    if (runtime.descriptor.kind === 'repeat') {
      continue
    }

    const targets = queryRuntimeElements(root, runtime, ownedSubtrees)

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])
      const parent = parentRegion(runtime, target, false)

      if (
        runtime.scope !== undefined
        && nearestRegion(target, regions, false) !== parent
      ) {
        throw new Error(
          'Lumi repeat binding crossed a repeat it does not own',
        )
      }

      const sink = {
        runtime,
        target,
        matchIndex,
        path: elementPath(parent?.target ?? root, target),
      }
      const scope = parent?.scope ?? rootScope

      if (parent !== null && sink.path.length === 0) {
        parent.ownSinks.push(sink)
        continue
      }

      // Array regions cannot safely live below another rule that replaces
      // their complete containing subtree.
      if (
        isStructuralBinding(runtime.descriptor)
        && scope.regions.some(region => target.contains(region.target))
      ) {
        throw new Error(
          'Lumi repeat cannot overlap a content-owning binding',
        )
      }

      scope.sinks.push(sink)
    }
  }

  for (const scope of [rootScope, ...regions.map(region => region.scope)]) {
    scope.locator = createLocator(
      [...scope.sinks, ...scope.regions].map(spec => spec.path),
    )
  }

  return rootScope
}

/**
 * @param {Element} target
 * @param {ReadonlyArray<RegionSpec>} regions
 * @param {boolean} strict
 * @param {Runtime} [runtime] The repeat declaration that must own the
 * region.
 * @returns {RegionSpec | null}
 */
function nearestRegion(target, regions, strict, runtime) {
  /** @type {RegionSpec | null} */
  let nearest = null

  for (const candidate of regions) {
    if (
      (runtime !== undefined && candidate.runtime !== runtime)
      ||
      (strict && candidate.target === target)
      // A target in an open shadow root of an occurrence is in the region.
      || !shadowIncludingContains(candidate.target, target)
    ) {
      continue
    }

    if (
      nearest === null
      || shadowIncludingContains(nearest.target, candidate.target)
    ) {
      nearest = candidate
    }
  }

  return nearest
}

/**
 * innerHTML can introduce descendant selector matches while retaining the
 * statically compiled target that owns them.
 *
 * @param {{ kind: string, name?: string }} descriptor
 */
function canCreateTargets(descriptor) {
  return descriptor.kind === 'property'
    && descriptor.name === 'innerHTML'
}

/**
 * @param {ScopeSpec} scope
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {ScopePlan}
 */
function prepareScope(scope, context) {
  return {
    sinks: prepareSinks(
      scope.sinks,
      context,
      new Array(scope.sinks.length),
      0,
    ),
    regions: scope.regions.map(spec => prepareRegion(spec, context)),
  }
}

/** @type {unknown[]} */
const noValues = []

/** @type {RegionPlan[]} */
const noRegionPlans = []

/**
 * Prepares one value for each sink spec, in the order of the specs, from
 * the position `offset` of `values`.
 *
 * @param {ReadonlyArray<SinkSpec>} specs
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @param {unknown[]} values
 * @param {number} offset
 * @returns {unknown[]}
 */
function prepareSinks(specs, context, values, offset) {
  for (let index = 0; index < specs.length; index += 1) {
    const spec = /** @type {SinkSpec} */ (specs[index])
    values[offset + index] = spec.runtime.normalize(
      projectValue(spec.runtime, spec.target, spec.matchIndex, context),
    )
  }

  return values
}

/**
 * Compares two repeat keys with the equality rules of a `Map`.
 *
 * @param {unknown} left
 * @param {unknown} right
 */
function sameKey(left, right) {
  return left === right || (left !== left && right !== right)
}

/**
 * @param {RegionSpec} spec
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {RegionPlan}
 */
function prepareRegion(spec, context) {
  const resolved = spec.runtime.normalize(
    projectValue(spec.runtime, spec.target, spec.matchIndex, context),
  )

  if (resolved === noValue) {
    return {
      spec,
      count: 0,
      keys: null,
      contexts: null,
      values: noValues,
      regions: noRegionPlans,
      isNoop: true,
    }
  }

  const entries = /** @type {unknown[]} */ (resolved)
  const length = entries.length
  const ownSinks = spec.ownSinks
  const sinks = spec.scope.sinks
  const nested = spec.scope.regions
  const ownCount = ownSinks.length
  const valueCount = ownCount + sinks.length
  const nestedCount = nested.length
  // An empty array is never written, so all plans can share one.
  /** @type {unknown[]} */
  const values = valueCount * length === 0
    ? noValues
    : new Array(valueCount * length)
  /** @type {RegionPlan[]} */
  const regions = nestedCount * length === 0
    ? noRegionPlans
    : new Array(nestedCount * length)
  const contexts = spec.keepsContexts ? new Array(length) : null
  const project = spec.runtime.descriptor.key
  // Keys that are equal to the accepted keys, position for position, are
  // unique. The explicit check starts at the first key that is different, so
  // an update with the same keys builds no lookup.
  const acceptedKeys = spec.acceptedKeys
  /** @type {unknown[] | null} */
  let keys = null
  /** @type {Map<unknown, number> | null} */
  let indexesByKey = null

  for (let index = 0; index < length; index += 1) {
    const occurrenceContext = itemContext(context, entries[index], index)

    if (contexts !== null) {
      contexts[index] = occurrenceContext
    }

    if (project !== undefined) {
      // The key projection does not get an occurrence element, because
      // reconciliation has not selected the element.
      let key

      try {
        key = project(occurrenceContext)
      } catch (error) {
        throw projectionError(
          spec.runtime.descriptor,
          spec.matchIndex,
          error,
          index,
        )
      }

      if (
        indexesByKey === null
        && (
          acceptedKeys === null
          || index >= acceptedKeys.length
          || !sameKey(acceptedKeys[index], key)
        )
      ) {
        indexesByKey = new Map()
        keys = new Array(length)

        for (let earlier = 0; earlier < index; earlier += 1) {
          const acceptedKey = /** @type {ReadonlyArray<unknown>} */ (
            acceptedKeys
          )[earlier]
          keys[earlier] = acceptedKey
          indexesByKey.set(acceptedKey, earlier)
        }
      }

      if (indexesByKey !== null && keys !== null) {
        const firstIndex = indexesByKey.get(key)

        if (firstIndex !== undefined) {
          throw new TypeError(
            `Lumi repeat key for "${spec.runtime.descriptor.selector}" `
            + `is duplicated at item positions ${firstIndex + 1} `
            + `and ${index + 1}`,
          )
        }
        indexesByKey.set(key, index)
        keys[index] = key
      }
    }

    const offset = index * valueCount
    prepareSinks(ownSinks, occurrenceContext, values, offset)
    prepareSinks(sinks, occurrenceContext, values, offset + ownCount)

    for (let region = 0; region < nestedCount; region += 1) {
      regions[index * nestedCount + region] = prepareRegion(
        /** @type {RegionSpec} */ (nested[region]),
        occurrenceContext,
      )
    }
  }

  /** @type {ReadonlyArray<unknown> | null} */
  let planKeys = null

  if (project !== undefined) {
    // Without a different key, the accepted array itself is the key list.
    // The commit sees the same array again and compares no keys.
    planKeys = spec.acceptedKeys = keys
      ?? (
        acceptedKeys === null || acceptedKeys.length === length
          ? acceptedKeys ?? []
          : acceptedKeys.slice(0, length)
      )
  }

  return {
    spec,
    count: length,
    keys: planKeys,
    contexts,
    values,
    regions,
    isNoop: false,
  }
}

/**
 * Evaluates one projection with its repeat context.
 *
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {number} matchIndex
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {unknown}
 */
function projectValue(runtime, element, matchIndex, context) {
  try {
    return runtime.descriptor.project(context, element)
  } catch (error) {
    throw projectionError(runtime.descriptor, matchIndex, error)
  }
}

/**
 * Structural properties are uncommon in array-rendering components. When
 * present, prepare their statically compiled work on an inert template copy,
 * then discover only selector matches that the static cardinality scope did
 * not already own. The ordinary cardinality path avoids this work entirely.
 *
 * @param {Element} blueprintRoot
 * @param {ScopeSpec} scope
 * @param {ScopePlan} plan
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 * @param {unknown} data
 * @returns {DynamicOperation[]}
 */
function prepareDynamicOperations(
  blueprintRoot,
  scope,
  plan,
  runtimes,
  ownedSubtreePaths,
  data,
) {
  const planningRoot = importElementTree(
    blueprintRoot.ownerDocument,
    blueprintRoot,
  )
  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtPath(planningRoot, path)
  })
  // The targets that each declaration has planned.
  /** @type {Map<Runtime, WeakSet<Element>>} */
  const handledByRuntime = new Map(
    runtimes.map(runtime => [runtime, new WeakSet()]),
  )
  /** @type {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} */
  const contextByElement = new WeakMap()
  /** @type {WeakMap<Element, ReadonlySet<number>>} */
  const createdBy = new WeakMap()
  /** @type {DynamicOperation[]} */
  const operations = []

  contextByElement.set(planningRoot, rootContext(data))

  /**
   * Applies one value to the copy. An innerHTML write marks the elements
   * that it creates, so that the declaration cannot select its own output.
   *
   * @param {Runtime} runtime
   * @param {Element} element
   * @param {unknown} value
   */
  const applyPlanned = (runtime, element, value) => {
    handledByRuntime.get(runtime)?.add(element)

    if (value !== noValue) {
      runtime.apply(element, value)

      if (canCreateTargets(runtime.descriptor)) {
        markCreated(
          element.firstChild,
          null,
          createdBy,
          new Set(createdBy.get(element)).add(runtime.index),
        )
      }
    }
  }

  const planningState = new ScopeState(planningRoot)
  planningState.connect(scope)
  planningState.apply(scope, applyPlanned, plan.sinks, 0, plan.regions, 0)
  trackOccurrences(
    planningState.regions,
    plan.regions,
    0,
    handledByRuntime,
    contextByElement,
  )

  /** @param {Runtime} runtime */
  const matchesOf = runtime => {
    return queryRuntimeElements(planningRoot, runtime, ownedSubtrees)
  }

  /**
   * Prepares the value for one target that the static scope does not own.
   *
   * @param {Runtime} runtime
   * @param {Element} element
   * @param {number} matchIndex
   * @param {number} matchCount
   */
  const prepare = (runtime, element, matchIndex, matchCount) => {
    const projected = projectValue(
      runtime,
      element,
      matchIndex,
      findContext(element, contextByElement),
    )

    if (
      runtime.descriptor.kind === 'property'
      && runtime.descriptor.name === 'outerHTML'
    ) {
      throw new TypeError(
        'Lumi outerHTML binding targets created during array planning '
        + 'must exist in the component source',
      )
    }

    const value = runtime.normalize(projected)
    operations.push({ runtime, matchIndex, matchCount, value })
    return value
  }

  const structuralRuntimes = runtimes.filter(isStructuralRuntime)

  // Each content write can remove or create the targets of other tasks, so
  // the tasks are listed again after each write.
  while (true) {
    const task = tasksByDepth(
      planningRoot,
      structuralRuntimes,
      matchesOf,
      (runtime, element) => {
        return handledByRuntime.get(runtime)?.has(element) !== true
          && createdBy.get(element)?.has(runtime.index) !== true
      },
    )[0]

    if (task === undefined) {
      break
    }

    const { runtime, element } = task
    applyPlanned(
      runtime,
      element,
      prepare(runtime, element, task.matchIndex, task.count),
    )
  }

  for (const runtime of runtimes) {
    if (isStructuralRuntime(runtime)) {
      continue
    }

    const elements = matchesOf(runtime)
    const handled = handledByRuntime.get(runtime)

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = /** @type {Element} */ (elements[matchIndex])

      if (handled?.has(element) !== true) {
        prepare(runtime, element, matchIndex, elements.length)
      }
    }
  }

  return operations
}

/**
 * Applies the values for the targets that the static scope does not own.
 *
 * An innerHTML projection may establish content that dynamically discovered
 * descendant rules refine. The commit caches the final subtree so the next
 * update does not rebuild unchanged markup and discard persistent
 * descendant nodes.
 *
 * @param {Element} root
 * @param {ReadonlyArray<DynamicOperation>} operations
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 */
function commitDynamicOperations(
  root,
  operations,
  runtimes,
  ownedSubtreePaths,
) {
  if (operations.length === 0) {
    return
  }

  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtPath(root, path)
  })

  for (const { runtime, matchIndex, matchCount, value } of operations) {
    const elements = queryRuntimeElements(root, runtime, ownedSubtrees)
    const element = elements[matchIndex]

    if (elements.length !== matchCount || element === undefined) {
      throw new Error(
        'Lumi DOM changed while committing selector '
        + `"${runtime.descriptor.selector}"`,
      )
    }

    applyLive(runtime, element, value)
  }

  for (const runtime of runtimes) {
    if (canCreateTargets(runtime.descriptor)) {
      for (const element of queryRuntimeElements(root, runtime, ownedSubtrees)) {
        const previous = runtime.values.get(element)

        if (previous !== undefined) {
          previous.domValue = element.innerHTML
        }
      }
    }
  }
}

/**
 * @param {Runtime} runtime
 */
function isStructuralRuntime(runtime) {
  return runtime.descriptor.kind === 'repeat'
    || isStructuralBinding(runtime.descriptor)
}

/**
 * @param {Element} el
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 */
function findContext(el, contextByElement) {
  let current = /** @type {Element | null} */ (el)

  while (current !== null) {
    const context = contextByElement.get(current)

    if (context !== undefined) {
      return context
    }

    current = shadowIncludingParent(current)
  }

  throw new Error('Lumi lost a dynamic projection context')
}

/**
 * Records the context of each occurrence after the inert cardinality plan
 * has been applied. This traversal exists only in the mixed structural path;
 * the live cardinality state retains its original fast apply methods.
 *
 * @param {ReadonlyArray<RegionState>} states The regions of one scope.
 * @param {ReadonlyArray<RegionPlan>} plans
 * @param {number} offset The position of the plan of the first region.
 * @param {Map<Runtime, WeakSet<Element>>} handledByRuntime
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 */
function trackOccurrences(
  states,
  plans,
  offset,
  handledByRuntime,
  contextByElement,
) {
  for (let region = 0; region < states.length; region += 1) {
    const plan = /** @type {RegionPlan} */ (plans[offset + region])
    const occurrences = /** @type {RegionState} */ (states[region]).occurrences
    const nestedCount = plan.spec.scope.regions.length

    // After the plan is applied, a region has one occurrence for each
    // planned occurrence.
    for (let index = 0; index < plan.count; index += 1) {
      const occurrence = /** @type {ScopeState} */ (occurrences[index])

      handledByRuntime.get(plan.spec.runtime)?.add(occurrence.element)
      contextByElement.set(
        occurrence.element,
        /** @type {import('./types.js').ProjectionContext<unknown, unknown>} */ (
          plan.contexts?.[index]
        ),
      )
      trackOccurrences(
        occurrence.regions,
        plan.regions,
        index * nestedCount,
        handledByRuntime,
        contextByElement,
      )
    }
  }
}

/** @type {Element[]} */
const noElements = []

/** @type {RegionState[]} */
const noRegionStates = []

/**
 * The state of one scope: the component boundary, or one occurrence of a
 * repeat. One object holds the element and its targets, so each occurrence
 * needs few objects.
 */
class ScopeState {
  /** @param {Element} element */
  constructor(element) {
    this.element = element
    // Null until the scope gets its first values.
    /** @type {Element[] | null} */
    this.sinks = null
    /** @type {RegionState[]} */
    this.regions = noRegionStates
  }

  /**
   * Finds the sink elements and the repeat targets in one walk.
   *
   * @param {ScopeSpec} spec
   */
  connect(spec) {
    const sinkCount = spec.sinks.length
    const regionCount = spec.regions.length

    if (sinkCount + regionCount === 0) {
      this.sinks = noElements
      return
    }

    /** @type {Element[]} */
    const found = new Array(sinkCount + regionCount)
    locateElements(this.element, spec.locator, found)

    if (regionCount > 0) {
      this.regions = spec.regions.map((region, index) => {
        return new RegionState(
          /** @type {Element} */ (found[sinkCount + index]),
          region,
        )
      })
      // The first occurrence of a region can go away. Do not keep it here.
      found.length = sinkCount
    }

    this.sinks = found
  }

  /**
   * Applies the values of a connected scope.
   *
   * @param {ScopeSpec} spec
   * @param {ApplyValue} apply
   * @param {ReadonlyArray<unknown>} values
   * @param {number} offset The position of the value of the first sink.
   * @param {ReadonlyArray<RegionPlan>} plans
   * @param {number} planOffset The position of the plan of the first region.
   */
  apply(spec, apply, values, offset, plans, planOffset) {
    const specs = spec.sinks
    const sinks = /** @type {Element[]} */ (this.sinks)

    for (let index = 0; index < specs.length; index += 1) {
      apply(
        /** @type {SinkSpec} */ (specs[index]).runtime,
        /** @type {Element} */ (sinks[index]),
        values[offset + index],
      )
    }

    const regions = this.regions

    for (let index = 0; index < regions.length; index += 1) {
      /** @type {RegionState} */ (regions[index]).apply(
        /** @type {RegionPlan} */ (plans[planOffset + index]),
        apply,
      )
    }
  }

  destroy() {
    for (const region of this.regions) {
      region.destroy()
    }
  }

  /** Removes an occurrence. */
  remove() {
    this.destroy()
    this.element.remove()
  }
}

class RegionState {
  /**
   * @param {Element} target
   * @param {RegionSpec} spec
   */
  constructor(target, spec) {
    this.spec = spec
    this.anchor = target.ownerDocument.createComment('lumi')
    target.after(this.anchor)
    this.occurrences = [new ScopeState(target)]
    // The key of each occurrence. Null until the first keyed plan: then the
    // one occurrence is the source element, which has no key.
    /** @type {ReadonlyArray<unknown> | null} */
    this.keys = null
  }

  /**
   * @param {RegionPlan} plan
   * @param {ApplyValue} apply
   */
  apply(plan, apply) {
    if (plan.isNoop) {
      return
    }

    if (plan.keys === null) {
      this.applyPositional(plan.count)
    } else {
      this.applyKeyed(plan.keys)
    }

    const spec = this.spec
    const scope = spec.scope
    const ownSinks = spec.ownSinks
    const ownCount = ownSinks.length
    const valueCount = ownCount + scope.sinks.length
    const nestedCount = scope.regions.length
    const occurrences = this.occurrences
    const values = plan.values

    for (let index = 0; index < plan.count; index += 1) {
      const occurrence = /** @type {ScopeState} */ (occurrences[index])
      const offset = index * valueCount

      if (occurrence.sinks === null) {
        occurrence.connect(scope)
      }

      for (let sink = 0; sink < ownCount; sink += 1) {
        apply(
          /** @type {SinkSpec} */ (ownSinks[sink]).runtime,
          occurrence.element,
          values[offset + sink],
        )
      }

      occurrence.apply(
        scope,
        apply,
        values,
        offset + ownCount,
        plan.regions,
        index * nestedCount,
      )
    }
  }

  /** @param {number} count */
  applyPositional(count) {
    const occurrences = this.occurrences

    while (occurrences.length < count) {
      occurrences.push(this.createOccurrence())
    }

    while (occurrences.length > count) {
      occurrences.pop()?.remove()
    }
  }

  /**
   * Reconciles keyed occurrences with the fewest DOM operations: one removal
   * for each removed key, one insertion at the final position for each new
   * key, and moves only for surviving occurrences outside the longest run
   * that is already in the new relative order. The data is authoritative:
   * if other code reordered the elements, this restores the projected order.
   *
   * @param {ReadonlyArray<unknown>} keys
   */
  applyKeyed(keys) {
    const previous = this.occurrences
    const previousKeys = this.keys
    const count = keys.length

    // With the same keys in the same order, no occurrence is new, removed,
    // or reordered. Only the check against the live DOM order remains.
    if (
      previousKeys !== null
      && (previousKeys === keys || hasSameKeys(previousKeys, keys))
    ) {
      this.placeInOrder(previous, null)
      return
    }

    /** @type {Map<unknown, number>} */
    const available = new Map()
    let pristineIndex = -1

    if (previousKeys === null) {
      pristineIndex = previous.length - 1
    } else {
      for (let index = 0; index < previous.length; index += 1) {
        available.set(previousKeys[index], index)
      }
    }

    /** @type {ScopeState[]} */
    const next = new Array(count)
    // The previous index of each occurrence, or -1 for a new occurrence.
    /** @type {number[]} */
    const sources = new Array(count)
    // Old indexes of survivors, in new order, are increasing until the first
    // reorder. Only a reorder needs the longest-run computation.
    let lastSource = -1
    let ordered = true

    for (let index = 0; index < count; index += 1) {
      const key = keys[index]
      let source = available.get(key)

      if (source !== undefined) {
        available.delete(key)
      } else if (pristineIndex !== -1) {
        source = pristineIndex
        pristineIndex = -1
      }

      if (source === undefined) {
        next[index] = this.detachedOccurrence()
        sources[index] = -1
      } else {
        next[index] = /** @type {ScopeState} */ (previous[source])
        sources[index] = source

        if (source < lastSource) {
          ordered = false
        }
        lastSource = source
      }
    }

    if (pristineIndex !== -1) {
      previous[pristineIndex]?.remove()
    }
    for (const source of available.values()) {
      previous[source]?.remove()
    }

    this.placeInOrder(next, ordered ? null : stableOccurrences(sources))
    this.occurrences = next
    this.keys = keys
  }

  /**
   * Makes the live DOM order match the order of the occurrences.
   *
   * @param {ReadonlyArray<ScopeState>} next
   * @param {Uint8Array | null} stable 1 at each index that must not move in
   * the first walk, or null when no occurrence changed its relative order.
   */
  placeInOrder(next, stable) {
    const parent = this.anchor.parentNode

    if (parent === null) {
      throw new Error('Lumi array binding anchor lost its parent')
    }

    let reference = /** @type {Node} */ (this.anchor)

    // Without a reorder, every element is checked against the live DOM here,
    // so this one walk also repairs changes that other code made. A new
    // occurrence is detached, so its next sibling never matches: it gets one
    // insertion at its final position.
    for (let index = next.length - 1; index >= 0; index -= 1) {
      const element = /** @type {ScopeState} */ (next[index]).element

      if (
        (stable === null || stable[index] === 0)
        && element.nextSibling !== reference
      ) {
        // moveBefore keeps the state of an element that is already in the
        // parent, but it rejects a new element and one that other code
        // took out of the parent. Those elements are inserted.
        if (element.parentNode === parent) {
          parent.moveBefore(element, reference)
        } else {
          parent.insertBefore(element, reference)
        }
      }
      reference = element
    }

    // The longest run comes from the remembered order. Other code can
    // reorder the elements, so a second walk reads the live DOM and moves
    // only on a mismatch; without outside changes it moves nothing. The first
    // walk cannot do this check for a stable element, because its next
    // sibling can correctly be a lower-index element that has not moved yet.
    if (stable !== null) {
      this.placeInOrder(next, null)
    }
  }

  /** @returns {ScopeState} */
  createOccurrence() {
    const occurrence = this.detachedOccurrence()
    this.anchor.parentNode?.insertBefore(occurrence.element, this.anchor)
    return occurrence
  }

  /** @returns {ScopeState} */
  detachedOccurrence() {
    const spec = this.spec

    return new ScopeState(
      importElementTree(
        this.anchor.ownerDocument,
        spec.target,
        spec.hasOpenShadowRoot,
      ),
    )
  }

  destroy() {
    for (const occurrence of this.occurrences) {
      occurrence.remove()
    }
    this.occurrences = []
    this.anchor.remove()
  }
}

/**
 * Tells whether two key lists have the same keys in the same order.
 *
 * @param {ReadonlyArray<unknown>} left
 * @param {ReadonlyArray<unknown>} right
 */
function hasSameKeys(left, right) {
  const length = left.length

  if (right.length !== length) {
    return false
  }

  for (let index = 0; index < length; index += 1) {
    if (!sameKey(left[index], right[index])) {
      return false
    }
  }

  return true
}

/**
 * Marks the surviving occurrences that stay in place during a keyed reorder:
 * the longest run of survivors whose previous DOM order is already the new
 * relative order. Every other survivor moves once. The computation is
 * O(n log n) and does not recurse.
 *
 * @param {ReadonlyArray<number>} sources The previous index of each
 * occurrence in the new order, or -1 for a new occurrence.
 * @returns {Uint8Array} 1 at each index that must not move
 */
function stableOccurrences(sources) {
  const length = sources.length
  // tails[k] is the index that ends the best run of length k + 1.
  const tails = new Int32Array(length)
  const predecessors = new Int32Array(length)
  let longest = 0

  for (let index = 0; index < length; index += 1) {
    const source = /** @type {number} */ (sources[index])

    if (source === -1) {
      continue
    }

    let low = 0
    let high = longest

    while (low < high) {
      const middle = (low + high) >>> 1
      const tail = /** @type {number} */ (tails[middle])

      if (/** @type {number} */ (sources[tail]) < source) {
        low = middle + 1
      } else {
        high = middle
      }
    }

    predecessors[index] = low > 0
      ? /** @type {number} */ (tails[low - 1])
      : -1
    tails[low] = index

    if (low === longest) {
      longest += 1
    }
  }

  const stable = new Uint8Array(length)
  let index = longest > 0 ? /** @type {number} */ (tails[longest - 1]) : -1

  while (index !== -1) {
    stable[index] = 1
    index = /** @type {number} */ (predecessors[index])
  }

  return stable
}

/**
 * Resolves a declaration against its component boundary or, when it belongs
 * to a repeat binding list, against occurrences of that owning repeat only.
 *
 * @param {Element} root
 * @param {Runtime} runtime
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
function queryRuntimeElements(root, runtime, ownedSubtrees) {
  const selector = runtime.descriptor.selector

  if (runtime.scope === undefined) {
    return queryOwnedElements(root, selector, ownedSubtrees)
  }

  const elements = new Set()

  for (const scopeElement of queryRuntimeElements(
    root,
    runtime.scope,
    ownedSubtrees,
  )) {
    for (const element of queryOwnedElements(
      scopeElement,
      selector,
      ownedSubtrees,
    )) {
      elements.add(element)
    }
  }

  return [...elements]
}
