// @ts-check

/**
 * Package-internal positional-cardinality planner. The supported package
 * surface is exported only from index.js.
 *
 * @internal
 */

import {
  elementAtPath,
  elementPath,
  importElementTree,
  markCreated,
  queryOwnedElements,
  shadowIncludingParent,
  tasksByDepth,
} from './dom.js'
import { noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {itemContext, rootContext} from './internal/projection-context.js'
import {isStructuralBinding} from './internal/structural.js'

const noKey = Symbol('Lumi unkeyed occurrence')

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
 */

/**
 * A plan holds one prepared value for each sink spec, at the same index. It
 * holds no object for each sink, so an update creates fewer objects.
 *
 * @typedef {object} ScopePlan
 * @property {ReadonlyArray<unknown>} sinks
 * @property {ReadonlyArray<RegionPlan>} regions
 */

/**
 * @typedef {object} OccurrencePlan
 * @property {ReadonlyArray<unknown>} ownSinks
 * @property {ScopePlan} scope
 * @property {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @property {unknown} key
 */

/**
 * @typedef {object} RegionPlan
 * @property {RegionSpec} spec
 * @property {OccurrencePlan[]} occurrences
 * @property {boolean} [isNoop]
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

  const scope = compileScope(
    blueprintRoot,
    runtimes,
    ownedSubtreePaths.map(path => elementAtPath(blueprintRoot, path)),
  )
  const needsDynamicPlanning = runtimes.some(runtime => {
    return canCreateTargets(runtime.descriptor)
  })
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
          state ??= new ScopeState(root, scope, applyLive)
          state.apply(plan)
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
 * @returns {ScopeSpec}
 */
function compileScope(root, runtimes, ownedSubtrees) {
  /** @type {Map<Element, RegionSpec>} */
  const regionByTarget = new Map()
  /** @type {ScopeSpec} */
  const rootScope = { sinks: [], regions: [] }

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
        scope: { sinks: [], regions: [] },
        acceptedKeys: null,
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
      || !candidate.target.contains(target)
    ) {
      continue
    }

    if (
      nearest === null
      || nearest.target.contains(candidate.target)
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
    sinks: prepareSinks(scope.sinks, context),
    regions: scope.regions.length === 0
      ? noRegionPlans
      : scope.regions.map(spec => prepareRegion(spec, context)),
  }
}

/** @type {ReadonlyArray<unknown>} */
const noValues = Object.freeze([])

/** @type {ReadonlyArray<RegionPlan>} */
const noRegionPlans = Object.freeze([])

/**
 * Prepares one value for each sink spec, at the same index.
 *
 * @param {ReadonlyArray<SinkSpec>} specs
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {ReadonlyArray<unknown>}
 */
function prepareSinks(specs, context) {
  const length = specs.length

  if (length === 0) {
    return noValues
  }

  /** @type {unknown[]} */
  const values = new Array(length)

  for (let index = 0; index < length; index += 1) {
    const spec = /** @type {SinkSpec} */ (specs[index])
    values[index] = spec.runtime.normalize(
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
      occurrences: [],
      isNoop: true,
    }
  }

  const entries = /** @type {unknown[]} */ (resolved)
  const length = entries.length
  /** @type {OccurrencePlan[]} */
  const occurrences = new Array(length)
  const keyed = spec.runtime.descriptor.key !== undefined
  // Keys that are equal to the accepted keys, position for position, are
  // unique. The explicit check starts at the first key that is different, so
  // an update with the same keys builds no lookup.
  const acceptedKeys = spec.acceptedKeys
  /** @type {unknown[] | null} */
  let keys = null
  /** @type {Map<unknown, number> | null} */
  let indexesByKey = null

  for (let index = 0; index < length; index += 1) {
    const entry = entries[index]

    const occurrenceContext = itemContext(context, entry, index)
    const key = projectKey(spec, occurrenceContext, index)

    if (keyed) {
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

    occurrences[index] = {
      ownSinks: prepareSinks(spec.ownSinks, occurrenceContext),
      context: occurrenceContext,
      key,
      scope: prepareScope(spec.scope, occurrenceContext),
    }
  }

  if (keyed) {
    spec.acceptedKeys = keys
      ?? (
        acceptedKeys === null || acceptedKeys.length === length
          ? acceptedKeys ?? []
          : acceptedKeys.slice(0, length)
      )
  }

  return {
    spec,
    occurrences,
  }
}

/**
 * Evaluates a keyed repeat without exposing an occurrence element before
 * reconciliation has selected it.
 *
 * @param {RegionSpec} spec
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @param {number} index
 * @returns {unknown}
 */
function projectKey(spec, context, index) {
  const project = spec.runtime.descriptor.key

  if (project === undefined) {
    return noKey
  }

  try {
    return project(context)
  } catch (error) {
    throw projectionError(spec.runtime.descriptor, spec.matchIndex, error, index)
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

  const planningState = new ScopeState(planningRoot, scope, applyPlanned)
  planningState.apply(plan)
  trackOccurrences(planningState, plan, handledByRuntime, contextByElement)

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
 * @param {ScopeState} state
 * @param {ScopePlan} plan
 * @param {Map<Runtime, WeakSet<Element>>} handledByRuntime
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 */
function trackOccurrences(state, plan, handledByRuntime, contextByElement) {
  plan.regions.forEach((regionPlan, regionIndex) => {
    const occurrences = /** @type {RegionState} */ (
      state.regions[regionIndex]
    ).occurrences

    // After the plan is applied, a region has one occurrence for each
    // occurrence plan.
    regionPlan.occurrences.forEach((occurrencePlan, index) => {
      const { element, scope } = /** @type {OccurrenceState} */ (
        occurrences[index]
      )

      handledByRuntime.get(regionPlan.spec.runtime)?.add(element)
      contextByElement.set(element, occurrencePlan.context)

      if (scope !== null) {
        trackOccurrences(
          scope,
          occurrencePlan.scope,
          handledByRuntime,
          contextByElement,
        )
      }
    })
  })
}

class ScopeState {
  /**
   * @param {Element} root
   * @param {ScopeSpec} spec
   * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
   */
  constructor(root, spec, apply) {
    this.root = root
    this.applyValue = apply
    this.sinkSpecs = spec.sinks
    this.sinkElements = spec.sinks.map(sink => {
      return elementAtPath(root, sink.path)
    })
    this.regions = spec.regions.map(region => {
      return new RegionState(
        elementAtPath(root, region.path),
        region,
        apply,
      )
    })
  }

  /** @param {ScopePlan} plan */
  apply(plan) {
    const specs = this.sinkSpecs

    for (let index = 0; index < specs.length; index += 1) {
      this.applyValue(
        /** @type {SinkSpec} */ (specs[index]).runtime,
        /** @type {Element} */ (this.sinkElements[index]),
        plan.sinks[index],
      )
    }

    for (let index = 0; index < plan.regions.length; index += 1) {
      /** @type {RegionState} */ (this.regions[index]).apply(
        /** @type {RegionPlan} */ (plan.regions[index]),
      )
    }
  }

  destroy() {
    for (const region of this.regions) {
      region.destroy()
    }
  }
}

class RegionState {
  /**
   * @param {Element} target
   * @param {RegionSpec} spec
   * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
   */
  constructor(target, spec, apply) {
    this.spec = spec
    this.applyValue = apply
    this.anchor = target.ownerDocument.createComment('lumi')
    target.after(this.anchor)
    this.occurrences = [new OccurrenceState(target)]
  }

  /** @param {RegionPlan} plan */
  apply(plan) {
    if (plan.isNoop === true) {
      return
    }

    if (this.spec.runtime.descriptor.key === undefined) {
      this.applyPositional(plan.occurrences)
    } else {
      this.applyKeyed(plan.occurrences)
    }

    for (let index = 0; index < plan.occurrences.length; index += 1) {
      this.applyOccurrence(
        /** @type {OccurrenceState} */ (this.occurrences[index]),
        /** @type {OccurrencePlan} */ (plan.occurrences[index]),
      )
    }
  }

  /** @param {OccurrencePlan[]} plans */
  applyPositional(plans) {
    while (this.occurrences.length < plans.length) {
      this.occurrences.push(this.createOccurrence())
    }

    while (this.occurrences.length > plans.length) {
      this.occurrences.pop()?.destroy()
    }
  }

  /**
   * Reconciles keyed occurrences with the fewest DOM operations: one removal
   * for each removed key, one insertion at the final position for each new
   * key, and moves only for surviving occurrences outside the longest run
   * that is already in the new relative order. The data is authoritative:
   * if other code reordered the elements, this restores the projected order.
   *
   * @param {OccurrencePlan[]} plans
   */
  applyKeyed(plans) {
    const previous = this.occurrences

    // With the same keys in the same order, no occurrence is new, removed,
    // or reordered. Only the check against the live DOM order remains.
    if (hasSameKeys(previous, plans)) {
      this.placeInOrder(previous, null)
      return
    }

    /** @type {Map<unknown, number>} */
    const available = new Map()
    let pristineIndex = -1

    for (let index = 0; index < previous.length; index += 1) {
      const occurrence = /** @type {OccurrenceState} */ (previous[index])

      if (occurrence.key === noKey) {
        pristineIndex = index
      } else {
        available.set(occurrence.key, index)
      }
    }

    /** @type {OccurrenceState[]} */
    const next = new Array(plans.length)
    // Old indexes of survivors, in new order, are increasing until the first
    // reorder. Only a reorder needs the longest-run computation.
    let lastSource = -1
    let ordered = true

    for (let index = 0; index < plans.length; index += 1) {
      const plan = /** @type {OccurrencePlan} */ (plans[index])
      let source = available.get(plan.key)

      if (source !== undefined) {
        available.delete(plan.key)
      } else if (pristineIndex !== -1) {
        source = pristineIndex
        pristineIndex = -1
      }

      /** @type {OccurrenceState} */
      let occurrence

      if (source === undefined) {
        occurrence = this.detachedOccurrence()
      } else {
        occurrence = /** @type {OccurrenceState} */ (previous[source])

        if (source < lastSource) {
          ordered = false
        }
        lastSource = source
      }

      occurrence.key = plan.key
      next[index] = occurrence
    }

    if (pristineIndex !== -1) {
      previous[pristineIndex]?.destroy()
    }
    for (const source of available.values()) {
      previous[source]?.destroy()
    }

    this.placeInOrder(
      next,
      ordered ? null : stableOccurrences(previous, next),
    )
    this.occurrences = next
  }

  /**
   * Makes the live DOM order match the order of the occurrences.
   *
   * @param {ReadonlyArray<OccurrenceState>} next
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
      const element = /** @type {OccurrenceState} */ (next[index]).element

      if (
        (stable === null || stable[index] === 0)
        && element.nextSibling !== reference
      ) {
        // An element already in the parent moves with moveBefore when the
        // browser provides it. A new element, or one that other code took
        // out of the parent, is inserted.
        const move = /** @type {any} */ (parent).moveBefore

        if (element.parentNode === parent && typeof move === 'function') {
          move.call(parent, element, reference)
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

  /** @returns {OccurrenceState} */
  createOccurrence() {
    const occurrence = this.detachedOccurrence()
    this.anchor.parentNode?.insertBefore(occurrence.element, this.anchor)
    return occurrence
  }

  /** @returns {OccurrenceState} */
  detachedOccurrence() {
    const element = /** @type {Element} */ (
      importElementTree(this.anchor.ownerDocument, this.spec.target)
    )
    return new OccurrenceState(element)
  }

  /**
   * @param {OccurrenceState} occurrence
   * @param {OccurrencePlan} plan
   */
  applyOccurrence(occurrence, plan) {
    if (occurrence.scope === null) {
      occurrence.scope = new ScopeState(
        occurrence.element,
        this.spec.scope,
        this.applyValue,
      )
    }

    const ownSinks = this.spec.ownSinks

    for (let index = 0; index < ownSinks.length; index += 1) {
      const sink = /** @type {SinkSpec} */ (ownSinks[index])
      this.applyValue(sink.runtime, occurrence.element, plan.ownSinks[index])
    }

    occurrence.scope.apply(plan.scope)
  }

  destroy() {
    for (const occurrence of this.occurrences) {
      occurrence.destroy()
    }
    this.occurrences = []
    this.anchor.remove()
  }
}

/**
 * Tells whether the plans have the keys of the current occurrences, in the
 * same order.
 *
 * @param {ReadonlyArray<OccurrenceState>} occurrences
 * @param {ReadonlyArray<OccurrencePlan>} plans
 */
function hasSameKeys(occurrences, plans) {
  const length = plans.length

  if (occurrences.length !== length) {
    return false
  }

  for (let index = 0; index < length; index += 1) {
    if (
      !sameKey(
        /** @type {OccurrenceState} */ (occurrences[index]).key,
        /** @type {OccurrencePlan} */ (plans[index]).key,
      )
    ) {
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
 * @param {ReadonlyArray<OccurrenceState>} previous
 * @param {ReadonlyArray<OccurrenceState>} next
 * @returns {Uint8Array} 1 at each index of `next` that must not move
 */
function stableOccurrences(previous, next) {
  /** @type {Map<OccurrenceState, number>} */
  const sourceByOccurrence = new Map()

  for (let index = 0; index < previous.length; index += 1) {
    sourceByOccurrence.set(
      /** @type {OccurrenceState} */ (previous[index]),
      index,
    )
  }

  const length = next.length
  const sources = new Int32Array(length)
  // tails[k] is the index in `next` that ends the best run of length k + 1.
  const tails = new Int32Array(length)
  const predecessors = new Int32Array(length)
  let longest = 0

  for (let index = 0; index < length; index += 1) {
    const source = sourceByOccurrence.get(
      /** @type {OccurrenceState} */ (next[index]),
    ) ?? -1
    sources[index] = source

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

class OccurrenceState {
  /** @param {Element} element */
  constructor(element) {
    this.element = element
    this.key = /** @type {unknown} */ (noKey)
    /** @type {ScopeState | null} */
    this.scope = null
  }

  destroy() {
    this.scope?.destroy()
    this.element.remove()
  }
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
