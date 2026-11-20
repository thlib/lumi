// @ts-check

/**
 * Package-internal positional-cardinality planner. The supported package
 * surface is exported only from index.js.
 *
 * @internal
 */

import {
  elementAtPath,
  elementDepth,
  elementPath,
  importElementTree,
  queryOwnedElements,
  shadowIncludingParent,
} from './dom.js'
import { isNoValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {
  contextPosition,
  itemContext,
  moveContext,
  rootContext,
  usesContextPosition,
} from './internal/projection-context.js'
import {isStructuralBinding} from './internal/structural.js'
import {
  SubscriberQueue,
  isTracked,
  listDependency,
  plainOf,
  releaseSubscriber,
  syncSubscriber,
  tracking,
  viewOf,
} from './tracked.js'

/** @typedef {import('./tracked.js').Dependency} Dependency */
/** @typedef {import('./tracked.js').Subscriber} Subscriber */
/**
 * @typedef {import('./types.js').ProjectionContext<unknown, unknown>} Context
 */

/**
 * The value writer and the queue of changed parts that all states of one
 * planner share. The queue is null when the planner does not track each part.
 *
 * @typedef {object} Shared
 * @property {(runtime: Runtime, element: Element, value: unknown) => void} apply
 * @property {SubscriberQueue | null} queue
 */

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
 * @property {WeakMap<Element, {
 *   projectedValue: unknown,
 *   domValue: unknown
 * }>} values
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
 * A plan also holds the positions of its tracked-data reads in the list of
 * reads of the preparation.
 *
 * @typedef {object} ScopePlan
 * @property {ReadonlyArray<unknown>} sinks
 * @property {number} readsEnd The position after the reads of the sinks.
 * @property {ReadonlyArray<RegionPlan>} regions
 */

/**
 * @typedef {object} OccurrencePlan
 * @property {ReadonlyArray<unknown>} ownSinks
 * @property {ScopePlan} scope
 * @property {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @property {unknown} key
 * @property {number} readsStart The position of the first read of the
 * occurrence, which is the first read of its key projection. The reads end
 * at `scope.readsEnd`.
 */

/**
 * @typedef {object} RegionPlan
 * @property {RegionSpec} spec
 * @property {OccurrencePlan[]} occurrences
 * @property {boolean} isNoop
 * @property {Context} context The occurrence that contains the region.
 * @property {ReadonlyArray<Dependency>} reads The tracked-data reads of the
 * item projection.
 */

/**
 * The plan of one repeat region after a change of tracked data. Lumi keeps
 * an occurrence whose item is the same tracked data, and whose own data did
 * not change, without a call to its projections.
 *
 * @typedef {object} RegionChange
 * @property {boolean} isNoop
 * @property {number} epoch The pass that made the plan.
 * @property {ReadonlyArray<Dependency>} reads
 * @property {Array<OccurrenceState | null>} sources For each item, the
 * current occurrence that shows it. Null is a new occurrence.
 * @property {Array<OccurrencePlan | null>} plans For each item, the plan of
 * its occurrence. Null keeps the occurrence as it is.
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
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
 * @param {() => void} schedule Requests a flush for the component.
 */
export function connectCardinalityDomBindings(
  root,
  blueprintRoot,
  runtimes,
  ownedSubtreePaths,
  normalize,
  apply,
  schedule,
) {
  const runtimesByDescriptor = new Map(
    runtimes.map(runtime => [runtime.descriptor, runtime]),
  )
  const ownedBlueprints = ownedSubtreePaths.map(path => {
    return elementAtBindingPath(blueprintRoot, path)
  })
  const scope = compileScope(
    blueprintRoot,
    runtimes,
    runtimesByDescriptor,
    ownedBlueprints,
  )
  const needsDynamicPlanning = runtimes.some(runtime => {
    return canCreateTargets(runtime.descriptor)
  })
  // Dynamic planning resolves selectors again in each update, so the planner
  // cannot prepare one part by itself. The component then prepares the
  // complete planner again when tracked data changes.
  /** @type {Shared} */
  const shared = {
    apply,
    queue: needsDynamicPlanning ? null : new SubscriberQueue(schedule),
  }
  /** @type {ScopeState | null} */
  let state = null

  return {
    prepare(/** @type {unknown} */ data) {
      const context = rootContext(data)
      /** @type {Dependency[] | null} */
      const reads = shared.queue === null ? null : []
      const outerUnitReads = unitReads
      const outerReads = tracking.reads
      /** @type {ScopePlan} */
      let plan
      /** @type {DynamicOperation[]} */
      let dynamicOperations

      unitReads = reads

      if (reads !== null) {
        tracking.reads = reads
      }

      try {
        plan = prepareScope(scope, normalize, context)
        dynamicOperations = needsDynamicPlanning
          ? prepareDynamicOperations(
            blueprintRoot,
            scope,
            plan,
            runtimes,
            runtimesByDescriptor,
            ownedSubtreePaths,
            data,
            normalize,
            apply,
          )
          : []
      } finally {
        unitReads = outerUnitReads
        tracking.reads = outerReads
      }

      return {
        commit() {
          const outerCommitReads = commitReads

          commitReads = reads ?? noReads

          try {
            state ??= new ScopeState(root, scope, shared, null)
            state.context = context
            state.apply(plan)
          } finally {
            commitReads = outerCommitReads
          }

          commitDynamicOperations(
            root,
            dynamicOperations,
            runtimes,
            runtimesByDescriptor,
            ownedSubtreePaths,
            apply,
          )
        },
      }
    },

    /**
     * Prepares only the parts whose tracked data changed.
     *
     * @returns {import('./types.js').PreparedUpdate | null}
     */
    prepareChanged() {
      const queue = shared.queue
      const current = state

      if (current === null || queue === null) {
        return null
      }

      const changed = queue.take()

      if (changed.length === 0) {
        return null
      }

      // A list is prepared before its rows, and a row before its nested lists.
      changed.sort((left, right) => left.depth - right.depth)
      epoch += 1

      /** @type {Dependency[]} */
      const reads = []
      /** @type {Array<() => void>} */
      const commits = []
      /** @type {Subscriber[]} */
      const covered = []
      const outerUnitReads = unitReads
      const outerReads = tracking.reads
      let isStructural = false

      unitReads = reads
      tracking.reads = reads

      try {
        for (const subscriber of changed) {
          const owner = subscriber.owner

          if (owner instanceof RegionState) {
            if (isCovered(owner.parent)) {
              covered.push(subscriber)
              continue
            }

            const plan = prepareRegionChange(owner, normalize)

            isStructural = true
            commits.push(() => owner.applyChange(plan))
          } else if (owner instanceof OccurrenceState) {
            if (isCovered(owner)) {
              covered.push(subscriber)
              continue
            }

            const region = owner.region
            const spec = region.spec
            const context = /** @type {Context} */ (owner.context)
            const readsStart = reads.length
            const key = projectKey(spec, context, contextPosition(context))

            if (!sameKey(key, owner.key)) {
              // The key selects the element of an item. A different key is
              // a change of the list, so the list is prepared.
              reads.length = readsStart

              const plan = prepareRegionChange(region, normalize)

              isStructural = true
              commits.push(() => region.applyChange(plan))
              continue
            }

            const ownSinks = prepareSinks(spec.ownSinks, normalize, context)
            const sinks = prepareSinks(spec.scope.sinks, normalize, context)
            const readsEnd = reads.length

            commits.push(() => {
              owner.region.applySinks(owner, ownSinks, sinks)
              owner.sync(readsStart, readsEnd)
            })
          } else {
            const readsStart = reads.length
            const sinks = prepareSinks(
              scope.sinks,
              normalize,
              /** @type {Context} */ (current.context),
            )
            const readsEnd = reads.length

            commits.push(() => {
              current.applySinks(sinks)
              current.sync(readsStart, readsEnd)
            })
          }
        }
      } catch (error) {
        queue.restore(changed)
        throw error
      } finally {
        unitReads = outerUnitReads
        tracking.reads = outerReads
      }

      return {
        isStructural,

        commit() {
          const outerCommitReads = commitReads

          commitReads = reads

          try {
            for (const commit of commits) {
              commit()
            }
          } finally {
            commitReads = outerCommitReads
          }

          // A part below a prepared list is usually prepared with that list
          // or removed. A part that is still changed gets its own pass.
          queue.restore(covered)

          if (queue.changed.length > 0) {
            schedule()
          }
        },

        discard() {
          queue.restore(changed)
        },
      }
    },

    destroy() {
      state?.destroy()
      state = null
    },
  }
}

/** @type {ReadonlyArray<Dependency>} */
const noReads = Object.freeze([])

/**
 * The tracked-data reads of the sinks in the preparation that runs now. The
 * value is null when the planner does not track each part.
 *
 * @type {Dependency[] | null}
 */
let unitReads = null

/**
 * The tracked-data reads of the preparation that Lumi commits now.
 *
 * @type {ReadonlyArray<Dependency>}
 */
let commitReads = noReads

/** The number of the current preparation of changed parts. */
let epoch = 0

/**
 * Tells whether a list above an occurrence was prepared in this pass and
 * does not keep the occurrence. The new plan of that list then contains the
 * occurrence, or removes it.
 *
 * @param {OccurrenceState | null} occurrence
 */
function isCovered(occurrence) {
  for (
    let current = occurrence;
    current !== null;
    current = current.region.parent
  ) {
    if (
      current.region.preparedEpoch === epoch
      && current.keptEpoch !== epoch
    ) {
      return true
    }
  }

  return false
}

/**
 * Compiles static template locations into nested positional regions.
 *
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {ScopeSpec}
 */
function compileScope(root, runtimes, runtimesByDescriptor, ownedSubtrees) {
  /** @type {RegionSpec[]} */
  const regions = []
  /** @type {Map<Element, RegionSpec>} */
  const regionByTarget = new Map()
  for (const runtime of runtimes) {
    if (runtime.descriptor.kind !== 'repeat') {
      continue
    }

    const targets = queryRuntimeElements(
      root,
      runtime,
      runtimesByDescriptor,
      ownedSubtrees,
    )

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

      if (ownedSubtrees.some(owned => {
        return target === owned || target.contains(owned)
      })) {
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

  regions.push(...regionByTarget.values())

  /** @type {ScopeSpec} */
  const rootScope = { sinks: [], regions: [] }

  for (const region of regions) {
    const scope = scopeRuntime(region.runtime, runtimesByDescriptor)
    const parent = nearestRegion(region.target, regions, true, scope)

    if (scope !== null && parent === null) {
      throw new Error('Lumi repeat binding escaped its owning repeat')
    }

    const parentTarget = parent?.target ?? root
    region.path = elementPath(
      parentTarget,
      region.target,
      'Lumi binding targets do not share a component source',
    )

    if (parent === null) {
      rootScope.regions.push(region)
    } else {
      parent.scope.regions.push(region)
    }
  }

  for (const runtime of runtimes) {
    if (
      runtime.descriptor.kind === 'repeat'
    ) {
      continue
    }

    const targets = queryRuntimeElements(
      root,
      runtime,
      runtimesByDescriptor,
      ownedSubtrees,
    )

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])
      const scope = scopeRuntime(runtime, runtimesByDescriptor)
      const nearest = nearestRegion(target, regions, false)
      const parent = nearestRegion(target, regions, false, scope)

      if (scope !== null && parent === null) {
        throw new Error('Lumi repeat binding escaped its owning repeat')
      }

      if (scope !== null && nearest !== parent) {
        throw new Error(
          'Lumi repeat binding crossed a repeat it does not own',
        )
      }

      const parentTarget = parent?.target ?? root
      const sink = {
        runtime,
        target,
        matchIndex,
        path: elementPath(
          parentTarget,
          target,
          'Lumi binding targets do not share a component source',
        ),
      }

      if (parent === null) {
        rootScope.sinks.push(sink)
      } else if (sink.path.length === 0) {
        parent.ownSinks.push(sink)
      } else {
        parent.scope.sinks.push(sink)
      }
    }
  }

  sortScope(rootScope)
  assertNoStructuralSinkOwnsRegion(rootScope)
  return rootScope
}

/**
 * @param {Element} target
 * @param {ReadonlyArray<RegionSpec>} regions
 * @param {boolean} strict
 * @param {Runtime | null} [runtime]
 * @returns {RegionSpec | null}
 */
function nearestRegion(target, regions, strict, runtime = null) {
  /** @type {RegionSpec | null} */
  let nearest = null

  for (const candidate of regions) {
    if (
      (runtime !== null && candidate.runtime !== runtime)
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
 * @param {ScopeSpec} scope
 */
function sortScope(scope) {
  scope.sinks.sort((left, right) => {
    return left.runtime.index - right.runtime.index
  })
  scope.regions.sort((left, right) => {
    const following = 4
    return left.target.compareDocumentPosition(right.target) & following
      ? -1
      : 1
  })

  for (const region of scope.regions) {
    region.ownSinks.sort((left, right) => {
      return left.runtime.index - right.runtime.index
    })
    sortScope(region.scope)
  }
}

/**
 * Array regions cannot safely live below another rule that replaces their
 * complete containing subtree.
 *
 * @param {ScopeSpec} scope
 */
function assertNoStructuralSinkOwnsRegion(scope) {
  for (const sink of scope.sinks) {
    if (!isStructuralBinding(sink.runtime.descriptor)) {
      continue
    }

    for (const region of scope.regions) {
      if (sink.target.contains(region.target)) {
        throw new Error(
          'Lumi repeat cannot overlap a content-owning binding',
        )
      }
    }
  }

  for (const region of scope.regions) {
    assertNoStructuralSinkOwnsRegion(region.scope)
  }
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
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {ScopePlan}
 */
function prepareScope(scope, normalize, context) {
  const sinks = prepareSinks(scope.sinks, normalize, context)

  return {
    sinks,
    readsEnd: unitReads === null ? 0 : unitReads.length,
    regions: scope.regions.length === 0
      ? noRegionPlans
      : scope.regions.map(spec => {
        return prepareRegion(spec, normalize, context)
      }),
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
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {ReadonlyArray<unknown>}
 */
function prepareSinks(specs, normalize, context) {
  const length = specs.length

  if (length === 0) {
    return noValues
  }

  /** @type {unknown[]} */
  const values = new Array(length)

  for (let index = 0; index < length; index += 1) {
    const spec = /** @type {SinkSpec} */ (specs[index])
    values[index] = normalize(
      spec.runtime,
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
 * Projects the items of one repeat region.
 *
 * @param {RegionSpec} spec
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {Context} context
 * @returns {{
 *   resolved: unknown,
 *   isTrackedList: boolean,
 *   reads: ReadonlyArray<Dependency>
 * }}
 */
function projectItems(spec, normalize, context) {
  const sinkReads = unitReads
  /** @type {Dependency[] | null} */
  const regionReads = sinkReads === null ? null : []

  if (regionReads !== null) {
    tracking.reads = regionReads
  }

  const projected = projectValue(
    spec.runtime,
    spec.target,
    spec.matchIndex,
    context,
  )
  // Lumi reads a tracked list as the plain list, and depends on all of its
  // elements with one dependency.
  const source = plainOf(projected)
  const isTrackedList = source !== projected

  if (isTrackedList && tracking.reads !== null) {
    const dependency = listDependency(/** @type {object} */ (source))

    if (dependency !== null) {
      tracking.reads.push(dependency)
    }
  }

  if (regionReads !== null) {
    tracking.reads = sinkReads
  }

  return {
    resolved: normalize(spec.runtime, source),
    isTrackedList,
    reads: regionReads ?? noReads,
  }
}

/**
 * @param {RegionSpec} spec
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {Context} context
 * @returns {RegionPlan}
 */
function prepareRegion(spec, normalize, context) {
  const {resolved, isTrackedList, reads} = projectItems(
    spec,
    normalize,
    context,
  )

  if (isNoValue(resolved)) {
    return {
      spec,
      occurrences: [],
      isNoop: true,
      context,
      reads,
    }
  }

  const sinkReads = unitReads
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
    const entry = isTrackedList ? viewOf(entries[index]) : entries[index]
    const occurrenceContext = itemContext(context, entry, index)
    // The reads of the key projection belong to the occurrence.
    const readsStart = sinkReads === null ? 0 : sinkReads.length
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
          throw duplicateKey(spec, firstIndex, index)
        }
        indexesByKey.set(key, index)
        keys[index] = key
      }
    }

    occurrences[index] = {
      ownSinks: prepareSinks(spec.ownSinks, normalize, occurrenceContext),
      context: occurrenceContext,
      key,
      scope: prepareScope(spec.scope, normalize, occurrenceContext),
      readsStart,
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
    isNoop: false,
    context,
    reads,
  }
}

/**
 * @param {RegionSpec} spec
 * @param {number} firstIndex
 * @param {number} index
 */
function duplicateKey(spec, firstIndex, index) {
  return new TypeError(
    `Lumi repeat key for "${spec.runtime.descriptor.selector}" `
    + `is duplicated at item positions ${firstIndex + 1} `
    + `and ${index + 1}`,
  )
}

/**
 * Prepares one repeat region after a change of tracked data.
 *
 * Most items are the same tracked data at the same position, or at a position
 * with a constant difference after one insertion or removal. Lumi finds these
 * with one comparison for each item, and keeps their occurrences without a
 * call to a projection. For each other item, the key selects the occurrence.
 *
 * @param {RegionState} region
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @returns {RegionChange}
 */
function prepareRegionChange(region, normalize) {
  const spec = region.spec
  const context = /** @type {Context} */ (region.context)
  const {resolved, isTrackedList, reads} = projectItems(
    spec,
    normalize,
    context,
  )

  if (isNoValue(resolved)) {
    return {isNoop: true, epoch, reads, sources: [], plans: []}
  }

  region.preparedEpoch = epoch

  const sinkReads = /** @type {Dependency[]} */ (unitReads)
  const entries = /** @type {unknown[]} */ (resolved)
  const length = entries.length
  const current = region.occurrences
  const keyed = spec.runtime.descriptor.key !== undefined
  const byKey = keyed ? region.keyLookup() : null
  /** @type {Array<OccurrenceState | null>} */
  const sources = new Array(length)
  /** @type {Array<OccurrencePlan | null>} */
  const plans = new Array(length)
  /** @type {Map<unknown, number> | null} */
  let newKeys = null
  // The difference between the current position and the new position of the
  // last item that the key lookup found.
  let offset = 0

  for (let index = 0; index < length; index += 1) {
    const entry = entries[index]
    const candidate = current[index + offset]

    if (
      candidate !== undefined
      && candidate.seenEpoch !== epoch
      && candidate.isUnchanged(isTrackedList ? entry : plainOf(entry))
      && (
        offset === 0
        || !usesContextPosition(/** @type {Context} */ (candidate.context))
      )
    ) {
      candidate.seenEpoch = epoch
      candidate.seenIndex = index
      candidate.keptEpoch = epoch
      sources[index] = candidate
      plans[index] = null
      continue
    }

    const item = isTrackedList ? viewOf(entry) : entry
    const occurrenceContext = itemContext(context, item, index)
    const readsStart = sinkReads.length
    const key = projectKey(spec, occurrenceContext, index)
    /** @type {OccurrenceState | null} */
    let existing = null

    if (byKey === null) {
      existing = current[index] ?? null
    } else {
      existing = byKey.get(key) ?? null

      if (existing !== null && existing.seenEpoch === epoch) {
        throw duplicateKey(spec, existing.seenIndex, index)
      }

      if (existing === null) {
        const firstIndex = newKeys?.get(key)

        if (firstIndex !== undefined) {
          throw duplicateKey(spec, firstIndex, index)
        }
        (newKeys ??= new Map()).set(key, index)
      }
    }

    if (existing !== null) {
      existing.seenEpoch = epoch
      existing.seenIndex = index

      if (existing.context !== null) {
        const position = contextPosition(existing.context)

        if (byKey !== null) {
          offset = position - index
        }

        if (
          existing.isUnchanged(plainOf(item))
          && (position === index || !usesContextPosition(existing.context))
        ) {
          // The occurrence keeps the reads of its last preparation.
          sinkReads.length = readsStart
          existing.keptEpoch = epoch
          sources[index] = existing
          plans[index] = null
          continue
        }
      }
    }

    sources[index] = existing
    plans[index] = {
      ownSinks: prepareSinks(spec.ownSinks, normalize, occurrenceContext),
      context: occurrenceContext,
      key,
      scope: prepareScope(spec.scope, normalize, occurrenceContext),
      readsStart,
    }
  }

  return {isNoop: false, epoch, reads, sources, plans}
}

/**
 * @param {ReadonlyArray<OccurrenceState>} occurrences
 * @returns {Map<unknown, OccurrenceState>}
 */
function occurrencesByKey(occurrences) {
  /** @type {Map<unknown, OccurrenceState>} */
  const byKey = new Map()

  for (const occurrence of occurrences) {
    if (occurrence.key !== noKey) {
      byKey.set(occurrence.key, occurrence)
    }
  }

  return byKey
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
    // A tracked item and its plain object are the same key.
    return plainOf(project(context))
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : String(error)

    throw new Error(
      `Lumi repeat key projection for "${spec.runtime.descriptor.selector}" `
      + `at matched position ${spec.matchIndex + 1}, item ${index + 1} `
      + `failed: ${detail}`,
      {cause: error},
    )
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
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 * @param {unknown} data
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
 * @returns {DynamicOperation[]}
 */
function prepareDynamicOperations(
  blueprintRoot,
  scope,
  plan,
  runtimes,
  runtimesByDescriptor,
  ownedSubtreePaths,
  data,
  normalize,
  apply,
) {
  const planningRoot = importElementTree(
    blueprintRoot.ownerDocument,
    blueprintRoot,
  )
  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtBindingPath(planningRoot, path)
  })
  /** @type {Map<Runtime, WeakSet<Element>>} */
  const handledByRuntime = new Map(
    runtimes.map(runtime => [runtime, new WeakSet()]),
  )
  /** @type {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} */
  const contextByElement = new WeakMap()
  /** @type {WeakMap<Element, ReadonlySet<number>>} */
  const createdBy = new WeakMap()
  /** @type {Array<{
   *   runtime: Runtime,
   *   element: Element,
   * }>} */
  const structuralApplications = []

  contextByElement.set(planningRoot, rootContext(data))

  /**
   * @param {Runtime} runtime
   * @param {Element} element
   * @param {unknown} value
   */
  const applyStaticPlanningValue = (runtime, element, value) => {
    const descriptor = runtime.descriptor

    apply(runtime, element, value)

    if (!isNoValue(value) && canCreateTargets(descriptor)) {
      structuralApplications.push({
        runtime,
        element,
      })
    }
  }

  const planningState = new ScopeState(
    planningRoot,
    scope,
    {apply: applyStaticPlanningValue, queue: null},
    null,
  )
  planningState.apply(plan)
  trackPlannedScope(
    planningState,
    plan,
    handledByRuntime,
    contextByElement,
  )

  for (const application of structuralApplications) {
    markStructuralCreation(
      application.runtime,
      application.element,
      contextByElement,
      createdBy,
    )
  }

  /**
   * @param {Runtime} runtime
   * @param {Element} element
   * @param {unknown} value
   */
  const applyDynamicPlanningValue = (runtime, element, value) => {
    apply(runtime, element, value)

    if (!isNoValue(value)) {
      markStructuralCreation(
        runtime,
        element,
        contextByElement,
        createdBy,
      )
    }
  }

  /** @type {DynamicOperation[]} */
  const operations = []
  /** @type {Map<Runtime, WeakSet<Element>>} */
  const processedByRuntime = new Map()
  for (const runtime of runtimes) {
    if (isStructuralRuntime(runtime)) {
      processedByRuntime.set(runtime, new WeakSet())
    }
  }

  while (true) {
    const task = nextDynamicStructuralTask(
      planningRoot,
      runtimes,
      ownedSubtrees,
      runtimesByDescriptor,
      handledByRuntime,
      processedByRuntime,
      createdBy,
    )

    if (task === null) {
      break
    }

    processedByRuntime.get(task.runtime)?.add(task.element)
    const value = prepareDynamicValue(
      task.runtime,
      task.element,
      contextByElement,
      normalize,
      task.matchIndex,
    )
    operations.push({
      runtime: task.runtime,
      matchIndex: task.matchIndex,
      matchCount: task.matchCount,
      value,
    })
    applyDynamicPlanningValue(task.runtime, task.element, value)
  }

  for (const runtime of runtimes) {
    if (isStructuralRuntime(runtime)) {
      continue
    }

    const elements = queryRuntimeElements(
      planningRoot,
      runtime,
      runtimesByDescriptor,
      ownedSubtrees,
    )
    const handled = handledByRuntime.get(runtime)

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = elements[matchIndex]

      if (element === undefined || handled?.has(element) === true) {
        continue
      }

      operations.push({
        runtime,
        matchIndex,
        matchCount: elements.length,
        value: prepareDynamicValue(
          runtime,
          element,
          contextByElement,
          normalize,
          matchIndex,
        ),
      })
    }
  }

  return operations
}

/**
 * @param {Element} root
 * @param {ReadonlyArray<DynamicOperation>} operations
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
 */
function commitDynamicOperations(
  root,
  operations,
  runtimes,
  runtimesByDescriptor,
  ownedSubtreePaths,
  apply,
) {
  if (operations.length === 0) {
    return
  }

  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtBindingPath(root, path)
  })

  for (const operation of operations) {
    const elements = queryRuntimeElements(
      root,
      operation.runtime,
      runtimesByDescriptor,
      ownedSubtrees,
    )
    const element = elements[operation.matchIndex]

    if (
      elements.length !== operation.matchCount
      || element === undefined
    ) {
      throw new Error(
        'Lumi DOM changed while committing selector '
        + `"${operation.runtime.descriptor.selector}"`,
      )
    }

    apply(operation.runtime, element, operation.value)
  }

  refreshDynamicParentCaches(
    root,
    runtimes,
    runtimesByDescriptor,
    ownedSubtrees,
  )
}

/**
 * An innerHTML projection may establish content that dynamically discovered
 * descendant rules refine. Cache the final subtree so the next update does
 * not rebuild unchanged markup and discard persistent descendant nodes.
 *
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function refreshDynamicParentCaches(
  root,
  runtimes,
  runtimesByDescriptor,
  ownedSubtrees,
) {
  for (const runtime of runtimes) {
    if (
      runtime.descriptor.kind !== 'property'
      || runtime.descriptor.name !== 'innerHTML'
    ) {
      continue
    }

    for (const element of queryRuntimeElements(
      root,
      runtime,
      runtimesByDescriptor,
      ownedSubtrees,
    )) {
      const previous = runtime.values.get(element)

      if (previous === undefined) {
        continue
      }

      runtime.values.set(element, {
        projectedValue: previous.projectedValue,
        domValue: Reflect.get(element, 'innerHTML'),
      })
    }
  }
}

/**
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @param {Map<Runtime, WeakSet<Element>>} handledByRuntime
 * @param {Map<Runtime, WeakSet<Element>>} processedByRuntime
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @returns {{
 *   runtime: Runtime,
 *   element: Element,
 *   matchIndex: number,
 *   matchCount: number,
 *   depth: number,
 * } | null}
 */
function nextDynamicStructuralTask(
  root,
  runtimes,
  ownedSubtrees,
  runtimesByDescriptor,
  handledByRuntime,
  processedByRuntime,
  createdBy,
) {
  /** @type {{
   *   runtime: Runtime,
   *   element: Element,
   *   matchIndex: number,
   *   matchCount: number,
   *   depth: number,
   * } | null} */
  let selected = null

  for (const runtime of runtimes) {
    if (!isStructuralRuntime(runtime)) {
      continue
    }

    const elements = queryRuntimeElements(
      root,
      runtime,
      runtimesByDescriptor,
      ownedSubtrees,
    )
    const handled = handledByRuntime.get(runtime)
    const processed = processedByRuntime.get(runtime)

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = elements[matchIndex]

      if (
        element === undefined
        || handled?.has(element) === true
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
          matchCount: elements.length,
          depth,
        }
      }
    }
  }

  return selected
}

/**
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {number} matchIndex
 */
function prepareDynamicValue(
  runtime,
  element,
  contextByElement,
  normalize,
  matchIndex,
) {
  const context = findContext(element, contextByElement)
  const projected = projectValue(
    runtime,
    element,
    matchIndex,
    context,
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

  return normalize(runtime, projected)
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
 * Records the statically compiled targets after their inert cardinality plan
 * has been applied. This traversal exists only in the mixed structural path;
 * the live cardinality state retains its original fast apply methods.
 *
 * @param {ScopeState} state
 * @param {ScopePlan} plan
 * @param {Map<Runtime, WeakSet<Element>>} handledByRuntime
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 */
function trackPlannedScope(
  state,
  plan,
  handledByRuntime,
  contextByElement,
) {
  const context = findContext(state.root, contextByElement)

  for (let index = 0; index < state.sinkSpecs.length; index += 1) {
    const sink = state.sinkSpecs[index]
    const element = state.sinkElements[index]

    if (sink !== undefined && element !== undefined) {
      handledByRuntime.get(sink.runtime)?.add(element)
      contextByElement.set(element, context)
    }
  }

  for (let regionIndex = 0; regionIndex < plan.regions.length; regionIndex += 1) {
    const regionPlan = plan.regions[regionIndex]
    const regionState = state.regions[regionIndex]

    if (regionPlan === undefined || regionState === undefined) {
      continue
    }

    for (
      let occurrenceIndex = 0;
      occurrenceIndex < regionPlan.occurrences.length;
      occurrenceIndex += 1
    ) {
      const occurrencePlan = regionPlan.occurrences[occurrenceIndex]
      const occurrenceState = regionState.occurrences[occurrenceIndex]

      if (occurrencePlan === undefined || occurrenceState === undefined) {
        continue
      }

      handledByRuntime.get(regionPlan.spec.runtime)
        ?.add(occurrenceState.element)
      contextByElement.set(
        occurrenceState.element,
        occurrencePlan.context,
      )

      for (const sink of regionPlan.spec.ownSinks) {
        handledByRuntime.get(sink.runtime)?.add(occurrenceState.element)
      }

      if (occurrenceState.scope !== null) {
        trackPlannedScope(
          occurrenceState.scope,
          occurrencePlan.scope,
          handledByRuntime,
          contextByElement,
        )
      }
    }
  }
}

/**
 * Marks elements produced by a structural property so that the same
 * declaration cannot recursively select its own output.
 *
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 */
function markStructuralCreation(
  runtime,
  element,
  contextByElement,
  createdBy,
) {
  const descriptor = runtime.descriptor

  if (descriptor.kind !== 'property') {
    return
  }

  const context = findContext(element, contextByElement)
  const history = new Set(createdBy.get(element) ?? [])
  history.add(runtime.index)

  if (descriptor.name === 'innerHTML') {
    for (const child of element.children) {
      markCreatedSubtree(
        child,
        context,
        history,
        contextByElement,
        createdBy,
      )
    }
  }
}

/**
 * @param {Element} element
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @param {ReadonlySet<number>} history
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 */
function markCreatedSubtree(
  element,
  context,
  history,
  contextByElement,
  createdBy,
) {
  contextByElement.set(element, context)
  createdBy.set(element, history)

  for (const child of element.children) {
    markCreatedSubtree(
      child,
      context,
      history,
      contextByElement,
      createdBy,
    )
  }
}

class ScopeState {
  /**
   * @param {Element} root
   * @param {ScopeSpec} spec
   * @param {Shared} shared
   * @param {OccurrenceState | null} owner The occurrence that contains the
   * scope, or null for the scope of the component.
   */
  constructor(root, spec, shared, owner) {
    this.root = root
    this.shared = shared
    this.owner = owner
    this.sinkSpecs = spec.sinks
    this.sinkElements = spec.sinks.map(sink => {
      return elementAtBindingPath(root, sink.path)
    })
    this.regions = spec.regions.map(region => {
      return new RegionState(
        elementAtBindingPath(root, region.path),
        region,
        shared,
        owner,
      )
    })
    // Only the scope of the component uses the next two fields. The sinks of
    // another scope belong to the subscriber of its occurrence.
    /** @type {Context | null} */
    this.context = null
    /** @type {Subscriber | null} */
    this.subscriber = null
  }

  /** @param {ScopePlan} plan */
  apply(plan) {
    this.applySinks(plan.sinks)

    if (this.owner === null) {
      this.sync(0, plan.readsEnd)
    }

    for (let index = 0; index < plan.regions.length; index += 1) {
      this.regions[index]?.apply(plan.regions[index])
    }
  }

  /** @param {ReadonlyArray<unknown>} values */
  applySinks(values) {
    const specs = this.sinkSpecs
    const apply = this.shared.apply

    for (let index = 0; index < specs.length; index += 1) {
      const sink = specs[index]
      const element = this.sinkElements[index]

      if (sink !== undefined && element !== undefined) {
        apply(sink.runtime, element, values[index])
      }
    }
  }

  /**
   * Makes the sinks of the component scope depend on the tracked data that
   * their last preparation read.
   *
   * @param {number} readsStart
   * @param {number} readsEnd
   */
  sync(readsStart, readsEnd) {
    this.subscriber = syncSubscriber(
      this.subscriber,
      commitReads,
      readsStart,
      readsEnd,
      this.shared.queue,
      this,
      0,
    )
  }

  destroy() {
    releaseSubscriber(this.subscriber)
    this.subscriber = null

    for (const region of this.regions) {
      region.destroy()
    }
  }
}

class RegionState {
  /**
   * @param {Element} target
   * @param {RegionSpec} spec
   * @param {Shared} shared
   * @param {OccurrenceState | null} parent The occurrence that contains the
   * region, or null for a region of the component scope.
   */
  constructor(target, spec, shared, parent) {
    if (target.parentNode === null) {
      throw new Error('Lumi array binding target lost its parent')
    }

    this.spec = spec
    this.shared = shared
    this.parent = parent
    // A region is prepared after the occurrence that contains it.
    this.depth = regionDepth(parent)
    this.anchor = target.ownerDocument.createComment('lumi')
    target.after(this.anchor)
    this.occurrences = [new OccurrenceState(target, this)]
    /** @type {Context | null} */
    this.context = null
    /** @type {Subscriber | null} */
    this.subscriber = null
    /** The pass that prepared this region for changed tracked data. */
    this.preparedEpoch = 0
    /**
     * The current occurrence of each key, for a preparation of changed
     * tracked data. The value is null until that preparation needs it.
     *
     * @type {Map<unknown, OccurrenceState> | null}
     */
    this.byKey = null
  }

  /** @returns {Map<unknown, OccurrenceState>} */
  keyLookup() {
    return this.byKey ??= occurrencesByKey(this.occurrences)
  }

  /** @param {RegionPlan | undefined} plan */
  apply(plan) {
    if (plan === undefined) {
      throw new Error('Lumi lost an array region plan')
    }

    this.context = plan.context
    this.subscriber = syncSubscriber(
      this.subscriber,
      plan.reads,
      0,
      plan.reads.length,
      this.shared.queue,
      this,
      this.depth,
    )

    if (plan.isNoop) {
      return
    }

    if (this.spec.runtime.descriptor.key === undefined) {
      this.applyPositional(plan.occurrences)
    } else {
      this.applyKeyed(plan.occurrences)
    }

    for (let index = 0; index < plan.occurrences.length; index += 1) {
      const occurrence = this.occurrences[index]
      const occurrencePlan = plan.occurrences[index]

      if (occurrence !== undefined && occurrencePlan !== undefined) {
        this.applyOccurrence(occurrence, occurrencePlan)
      }
    }
  }

  /**
   * Applies the plan of a change of tracked data.
   *
   * @param {RegionChange} plan
   */
  applyChange(plan) {
    this.subscriber = syncSubscriber(
      this.subscriber,
      plan.reads,
      0,
      plan.reads.length,
      this.shared.queue,
      this,
      this.depth,
    )

    if (plan.isNoop) {
      return
    }

    const {sources, plans} = plan
    const previous = this.occurrences
    const length = sources.length
    const byKey = this.byKey
    /** @type {OccurrenceState[]} */
    const next = new Array(length)
    // Before the first item list, the region has the source element only.
    // The first new item uses this element.
    const first = previous[0]
    let pristine = previous.length === 1
      && first !== undefined
      && first.context === null
      && first.seenEpoch !== plan.epoch
      ? first
      : null
    let kept = 0
    let lastPosition = -1
    let ordered = true

    for (let index = 0; index < length; index += 1) {
      let occurrence = sources[index] ?? null

      if (occurrence === null) {
        if (pristine === null) {
          next[index] = this.detachedOccurrence()
          continue
        }

        occurrence = pristine
        pristine = null
        occurrence.seenEpoch = plan.epoch
      }

      const position = occurrence.context === null
        ? 0
        : contextPosition(occurrence.context)

      if (position < lastPosition) {
        ordered = false
      }
      lastPosition = position
      kept += 1
      next[index] = occurrence
    }

    if (kept < previous.length) {
      for (const occurrence of previous) {
        if (occurrence.seenEpoch !== plan.epoch) {
          byKey?.delete(occurrence.key)
          occurrence.destroy()
        }
      }
    }

    this.placeInOrder(
      next,
      ordered ? null : stableOccurrences(previous, next),
    )
    this.occurrences = next

    for (let index = 0; index < length; index += 1) {
      const occurrence = /** @type {OccurrenceState} */ (next[index])
      const occurrencePlan = plans[index] ?? null

      if (occurrencePlan === null) {
        // The item is the same. Only its position can be different.
        moveContext(/** @type {Context} */ (occurrence.context), index)
        continue
      }

      if (byKey !== null && occurrence.key !== occurrencePlan.key) {
        byKey.delete(occurrence.key)
        byKey.set(occurrencePlan.key, occurrence)
      }
      occurrence.key = occurrencePlan.key
      this.applyOccurrence(occurrence, occurrencePlan)
    }
  }

  /** @param {OccurrencePlan[]} plans */
  applyPositional(plans) {
    this.byKey = null

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

    this.byKey = null

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
        placeBefore(parent, element, reference)
      }
      reference = element
    }

    if (stable !== null) {
      // The longest run comes from the remembered order. Other code can
      // reorder the elements, so this pass reads the live DOM and moves only
      // on a mismatch; without outside changes it moves nothing. The main
      // walk cannot do this check for a stable element, because its next
      // sibling can correctly be a lower-index element that has not moved yet.
      reference = this.anchor
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const element = /** @type {OccurrenceState} */ (next[index]).element

        if (element.nextSibling !== reference) {
          placeBefore(parent, element, reference)
        }
        reference = element
      }
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
    return new OccurrenceState(element, this)
  }

  /**
   * @param {OccurrenceState} occurrence
   * @param {OccurrencePlan} plan
   */
  applyOccurrence(occurrence, plan) {
    occurrence.context = plan.context
    occurrence.plainItem = unknownItem
    this.applySinks(occurrence, plan.ownSinks, plan.scope.sinks)

    // Plain data has no tracked reads, and then nothing is recorded.
    if (
      occurrence.subscriber !== null
      || plan.scope.readsEnd !== plan.readsStart
    ) {
      occurrence.sync(plan.readsStart, plan.scope.readsEnd)
    }

    const regions = plan.scope.regions

    if (regions.length > 0) {
      const scope = /** @type {ScopeState} */ (occurrence.scope)

      for (let index = 0; index < regions.length; index += 1) {
        scope.regions[index]?.apply(regions[index])
      }
    }
  }

  /**
   * Applies the values of the sinks of one occurrence. The nested regions
   * are not changed.
   *
   * @param {OccurrenceState} occurrence
   * @param {ReadonlyArray<unknown>} ownValues
   * @param {ReadonlyArray<unknown>} scopeValues
   */
  applySinks(occurrence, ownValues, scopeValues) {
    occurrence.scope ??= new ScopeState(
      occurrence.element,
      this.spec.scope,
      this.shared,
      occurrence,
    )

    const ownSinks = this.spec.ownSinks
    const apply = this.shared.apply

    for (let index = 0; index < ownSinks.length; index += 1) {
      const sink = /** @type {SinkSpec} */ (ownSinks[index])
      apply(sink.runtime, occurrence.element, ownValues[index])
    }

    occurrence.scope.applySinks(scopeValues)
  }

  destroy() {
    releaseSubscriber(this.subscriber)
    this.subscriber = null

    for (const occurrence of this.occurrences) {
      occurrence.destroy()
    }
    this.occurrences = []
    this.byKey = null
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

/**
 * Puts a keyed occurrence element before the reference node. An element that
 * is already in the parent moves with moveBefore when possible. A new element,
 * or one that other code took out of the parent, is inserted.
 *
 * @param {Node} parent
 * @param {Node} node
 * @param {Node} reference
 */
function placeBefore(parent, node, reference) {
  if (node.parentNode === parent) {
    moveBefore(parent, node, reference)
  } else {
    parent.insertBefore(node, reference)
  }
}

/**
 * Uses the state-preserving DOM move operation when the browser provides it.
 *
 * @param {Node} parent
 * @param {Node} node
 * @param {Node | null} reference
 */
function moveBefore(parent, node, reference) {
  const move = Reflect.get(parent, 'moveBefore')

  if (typeof move === 'function') {
    Reflect.apply(move, parent, [node, reference])
    return
  }

  parent.insertBefore(node, reference)
}

const unknownItem = Symbol('Lumi unknown item')

/**
 * Returns the preparation depth of a region inside an occurrence.
 *
 * @param {OccurrenceState | null} parent
 * @returns {number}
 */
function regionDepth(parent) {
  return parent === null ? 1 : parent.region.depth + 2
}

class OccurrenceState {
  /**
   * @param {Element} element
   * @param {RegionState} region
   */
  constructor(element, region) {
    this.element = element
    this.region = region
    this.key = /** @type {unknown} */ (noKey)
    /** @type {ScopeState | null} */
    this.scope = null
    /** @type {Context | null} */
    this.context = null
    /** @type {Subscriber | null} */
    this.subscriber = null
    /** The pass in which the region kept this occurrence unchanged. */
    this.keptEpoch = 0
    /** The pass in which an item of the new list selected this occurrence. */
    this.seenEpoch = 0
    /** The position of that item in the new list. */
    this.seenIndex = 0
    /**
     * The plain value of the item, for the comparison with a new item. Lumi
     * calculates it when a preparation of changed tracked data needs it.
     *
     * @type {unknown}
     */
    this.plainItem = unknownItem
    this.isKeepable = false
  }

  /**
   * Tells whether the occurrence already shows an item, given as its plain
   * value.
   *
   * The item must be tracked data or a primitive value. Lumi cannot see a
   * change in an object that is not tracked, so it prepares such an item
   * again.
   *
   * @param {unknown} plain
   */
  isUnchanged(plain) {
    if (this.plainItem === unknownItem) {
      const context = this.context

      if (context === null) {
        return false
      }

      const item = context.item

      this.plainItem = plainOf(item)
      this.isKeepable = (typeof item !== 'object' && typeof item !== 'function')
        || item === null
        || isTracked(item)
    }

    return this.isKeepable
      && Object.is(this.plainItem, plain)
      && (this.subscriber === null || !this.subscriber.isChanged)
  }

  /**
   * Makes the sinks of the occurrence depend on the tracked data that their
   * last preparation read.
   *
   * @param {number} readsStart
   * @param {number} readsEnd
   */
  sync(readsStart, readsEnd) {
    this.subscriber = syncSubscriber(
      this.subscriber,
      commitReads,
      readsStart,
      readsEnd,
      this.region.shared.queue,
      this,
      this.region.depth + 1,
    )
  }

  destroy() {
    releaseSubscriber(this.subscriber)
    this.subscriber = null
    this.scope?.destroy()
    this.element.remove()
  }
}

/**
 * Resolves the repeat declaration that owns a locally declared binding.
 *
 * @param {Runtime} runtime
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @returns {Runtime | null}
 */
function scopeRuntime(runtime, runtimesByDescriptor) {
  const descriptor = runtime.descriptor.scope

  if (descriptor === undefined) {
    return null
  }

  const scope = runtimesByDescriptor.get(descriptor)

  if (scope === undefined || scope.descriptor.kind !== 'repeat') {
    throw new Error('Lumi repeat binding lost its owning repeat')
  }

  return scope
}

/**
 * Resolves a declaration against its component boundary or, when it belongs
 * to a repeat binding list, against occurrences of that owning repeat only.
 *
 * @param {Element} root
 * @param {Runtime} runtime
 * @param {ReadonlyMap<Runtime['descriptor'], Runtime>} runtimesByDescriptor
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
function queryRuntimeElements(
  root,
  runtime,
  runtimesByDescriptor,
  ownedSubtrees,
) {
  const scope = scopeRuntime(runtime, runtimesByDescriptor)

  if (scope === null) {
    return queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
    )
  }

  const scopeElements = queryRuntimeElements(
    root,
    scope,
    runtimesByDescriptor,
    ownedSubtrees,
  )
  const elements = new Set()

  for (const scopeElement of scopeElements) {
    for (const element of queryOwnedElements(
      scopeElement,
      runtime.descriptor.selector,
      ownedSubtrees,
    )) {
      elements.add(element)
    }
  }

  return [...elements]
}

/**
 * @param {Element} root
 * @param {ReadonlyArray<number>} path
 */
function elementAtBindingPath(root, path) {
  return elementAtPath(
    root,
    path,
    'Lumi array template lost a binding target',
  )
}
