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
 */

/**
 * @typedef {object} SinkPlan
 * @property {SinkSpec} spec
 * @property {unknown} value
 */

/**
 * @typedef {object} ScopePlan
 * @property {SinkPlan[]} sinks
 * @property {RegionPlan[]} regions
 */

/**
 * @typedef {object} OccurrencePlan
 * @property {SinkPlan[]} ownSinks
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
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
 */
export function connectCardinalityDomBindings(
  root,
  blueprintRoot,
  runtimes,
  ownedSubtreePaths,
  normalize,
  apply,
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
  /** @type {ScopeState | null} */
  let state = null

  return {
    prepare(/** @type {unknown} */ data) {
      const plan = prepareScope(
        scope,
        normalize,
        rootContext(data),
      )
      const dynamicOperations = needsDynamicPlanning
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
      return {
        commit() {
          state ??= new ScopeState(root, scope, apply)
          state.apply(plan)
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

    destroy() {
      state?.destroy()
      state = null
    },
  }
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
  return {
    sinks: scope.sinks.map(spec => {
      return prepareSink(spec, normalize, context)
    }),
    regions: scope.regions.map(spec => {
      return prepareRegion(spec, normalize, context)
    }),
  }
}

/**
 * @param {SinkSpec} spec
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {SinkPlan}
 */
function prepareSink(spec, normalize, context) {
  const projected = projectValue(
    spec.runtime,
    spec.target,
    spec.matchIndex,
    context,
  )
  return {
    spec,
    value: normalize(spec.runtime, projected),
  }
}

/**
 * @param {RegionSpec} spec
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {RegionPlan}
 */
function prepareRegion(spec, normalize, context) {
  const projected = projectValue(
    spec.runtime,
    spec.target,
    spec.matchIndex,
    context,
  )
  const resolved = normalize(spec.runtime, projected)

  if (isNoValue(resolved)) {
    return {
      spec,
      occurrences: [],
      isNoop: true,
    }
  }

  const entries = /** @type {unknown[]} */ (resolved)
  /** @type {OccurrencePlan[]} */
  const occurrences = new Array(entries.length)
  /** @type {Map<unknown, number> | null} */
  const indexesByKey = spec.runtime.descriptor.key === undefined
    ? null
    : new Map()

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]

    const occurrenceContext = itemContext(context, entry, index)
    const key = projectKey(spec, occurrenceContext, index)

    if (indexesByKey !== null) {
      if (indexesByKey.has(key)) {
        const firstIndex = /** @type {number} */ (indexesByKey.get(key))
        throw new TypeError(
          `Lumi repeat key for "${spec.runtime.descriptor.selector}" `
          + `is duplicated at item positions ${firstIndex + 1} `
          + `and ${index + 1}`,
        )
      }
      indexesByKey.set(key, index)
    }
    const ownSinks = spec.ownSinks.map(sink => {
      return prepareSink(sink, normalize, occurrenceContext)
    })

    occurrences[index] = {
      ownSinks,
      context: occurrenceContext,
      key,
      scope: prepareScope(spec.scope, normalize, occurrenceContext),
    }
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
    applyStaticPlanningValue,
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

  for (let index = 0; index < plan.sinks.length; index += 1) {
    const sink = plan.sinks[index]
    const element = state.sinkElements[index]

    if (sink !== undefined && element !== undefined) {
      handledByRuntime.get(sink.spec.runtime)?.add(element)
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

      for (const sink of occurrencePlan.ownSinks) {
        handledByRuntime.get(sink.spec.runtime)?.add(occurrenceState.element)
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
   * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
   */
  constructor(root, spec, apply) {
    this.root = root
    this.applyValue = apply
    this.sinkElements = spec.sinks.map(sink => {
      return elementAtBindingPath(root, sink.path)
    })
    this.regions = spec.regions.map(region => {
      return new RegionState(
        elementAtBindingPath(root, region.path),
        region,
        apply,
      )
    })
  }

  /** @param {ScopePlan} plan */
  apply(plan) {
    for (let index = 0; index < plan.sinks.length; index += 1) {
      const sink = plan.sinks[index]
      const element = this.sinkElements[index]

      if (sink !== undefined && element !== undefined) {
        this.applyValue(sink.spec.runtime, element, sink.value)
      }
    }

    for (let index = 0; index < plan.regions.length; index += 1) {
      this.regions[index]?.apply(plan.regions[index])
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
    if (target.parentNode === null) {
      throw new Error('Lumi array binding target lost its parent')
    }

    this.spec = spec
    this.applyValue = apply
    this.anchor = target.ownerDocument.createComment('lumi')
    target.after(this.anchor)
    this.occurrences = [new OccurrenceState(target)]
  }

  /** @param {RegionPlan | undefined} plan */
  apply(plan) {
    if (plan === undefined) {
      throw new Error('Lumi lost an array region plan')
    }

    if (plan.isNoop === true) {
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

    const parent = this.anchor.parentNode

    if (parent === null) {
      throw new Error('Lumi array binding anchor lost its parent')
    }

    const stable = ordered ? null : stableOccurrences(previous, next)
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

    this.occurrences = next
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

    for (const sink of plan.ownSinks) {
      this.applyValue(sink.spec.runtime, occurrence.element, sink.value)
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
