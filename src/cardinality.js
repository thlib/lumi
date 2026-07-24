// @ts-check

/**
 * Package-internal positional-cardinality planner. The supported package
 * surface is exported only from index.js.
 *
 * @internal
 */

import {
  cloneElementTree,
  elementAtPath,
  elementPath,
  importElementTree,
  queryElements,
  shadowIncludingContains,
  shadowIncludingParent,
} from './dom.js'
import { isNoValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * @typedef {object} Runtime
 * @property {{
 *   kind: 'bind' | 'property' | 'attribute' | 'class' | 'style',
 *   selector: string,
 *   project: (data: unknown, element: Element) => unknown,
 *   name?: string
 * }} descriptor
 * @property {number} index
 * @property {WeakMap<Element, {
 *   projectedValue: unknown,
 *   domValue: unknown
 * }>} values
 * @property {unknown[]} replay
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
 * @property {boolean} isRoot
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
 * @property {'text' | 'context'} mode
 * @property {string} [text]
 * @property {SinkPlan[]} ownSinks
 * @property {ScopePlan} [scope]
 */

/**
 * @typedef {object} RegionPlan
 * @property {RegionSpec} spec
 * @property {OccurrencePlan[]} occurrences
 * @property {boolean} isArray
 * @property {boolean} [isNoop]
 */

/**
 * @typedef {object} DynamicOperation
 * @property {Runtime} runtime
 * @property {number} matchIndex
 * @property {number} matchCount
 * @property {unknown} value
 */

const missing = Symbol('Lumi missing array coordinate')

/**
 * Creates the array-aware DOM planner used after a bind projection first
 * returns an array.
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
  const ownedBlueprints = ownedSubtreePaths.map(path => {
    return elementAtPath(
      blueprintRoot,
      path,
      'Lumi array template lost a binding target',
    )
  })
  const scope = compileScope(blueprintRoot, runtimes, ownedBlueprints)
  const needsDynamicPlanning = runtimes.some(runtime => {
    return canCreateTargets(runtime.descriptor)
  })
  /** @type {ScopeState | null} */
  let state = null

  return {
    prepare(/** @type {unknown} */ data) {
      const plan = prepareScope(scope, data, [], normalize)
      const dynamicOperations = needsDynamicPlanning
        ? prepareDynamicOperations(
          blueprintRoot,
          scope,
          plan,
          runtimes,
          ownedSubtreePaths,
          data,
          normalize,
          apply,
        )
        : []
      let settled = false

      return {
        commit() {
          if (settled) {
            throw new Error('Cannot commit a settled Lumi update')
          }

          state ??= new ScopeState(root, scope, apply)
          state.apply(plan)
          commitDynamicOperations(
            root,
            dynamicOperations,
            runtimes,
            ownedSubtreePaths,
            apply,
          )
          settled = true
        },

        discard() {
          settled = true
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
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {ScopeSpec}
 */
function compileScope(root, runtimes, ownedSubtrees) {
  /** @type {RegionSpec[]} */
  const regions = []
  /** @type {Map<Element, RegionSpec>} */
  const regionByTarget = new Map()

  for (const runtime of runtimes) {
    if (runtime.descriptor.kind !== 'bind') {
      continue
    }

    const targets = queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
    )

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])

      if (ownedSubtrees.some(owned => {
        return target === owned || target.contains(owned)
      })) {
        throw new Error(
          'Lumi array bind cannot replace a child subtree',
        )
      }

      // As with overlapping scalar bind sinks, the last declaration owns the
      // result. It also owns cardinality for this template location.
      regionByTarget.set(target, {
        runtime,
        target,
        matchIndex,
        path: [],
        isRoot: target === root,
        ownSinks: [],
        scope: { sinks: [], regions: [] },
      })
    }
  }

  regions.push(...regionByTarget.values())

  /** @type {ScopeSpec} */
  const rootScope = { sinks: [], regions: [] }

  for (const region of regions) {
    const parent = nearestRegion(region.target, regions, true)
    const parentTarget = parent?.target ?? root
    region.path = elementPath(
      parentTarget,
      region.target,
      'Lumi binding targets do not share a component template',
    )

    if (parent === null) {
      rootScope.regions.push(region)
    } else {
      parent.scope.regions.push(region)
    }
  }

  for (const runtime of runtimes) {
    if (runtime.descriptor.kind === 'bind') {
      continue
    }

    const targets = queryOwnedElements(
      root,
      runtime.descriptor.selector,
      ownedSubtrees,
    )

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])
      const parent = nearestRegion(target, regions, false)
      const parentTarget = parent?.target ?? root
      const sink = {
        runtime,
        target,
        matchIndex,
        path: elementPath(
          parentTarget,
          target,
          'Lumi binding targets do not share a component template',
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
 * @returns {RegionSpec | null}
 */
function nearestRegion(target, regions, strict) {
  /** @type {RegionSpec | null} */
  let nearest = null

  for (const candidate of regions) {
    if (
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
    return compareElementPosition(left.target, right.target)
  })

  for (const region of scope.regions) {
    region.ownSinks.sort((left, right) => {
      return left.runtime.index - right.runtime.index
    })
    sortScope(region.scope)
  }
}

/**
 * @param {Element} left
 * @param {Element} right
 */
function compareElementPosition(left, right) {
  const position = left.compareDocumentPosition(right)
  const following = 4
  return position & following ? -1 : 1
}

/**
 * Array regions cannot safely live below another rule that replaces their
 * complete containing subtree.
 *
 * @param {ScopeSpec} scope
 */
function assertNoStructuralSinkOwnsRegion(scope) {
  for (const sink of scope.sinks) {
    if (!isContentSink(sink.runtime.descriptor)) {
      continue
    }

    for (const region of scope.regions) {
      if (sink.target.contains(region.target)) {
        throw new Error(
          'Lumi array bind cannot overlap a content-owning binding',
        )
      }
    }
  }

  for (const region of scope.regions) {
    assertNoStructuralSinkOwnsRegion(region.scope)
  }
}

/**
 * @param {{ kind: string, name?: string }} descriptor
 */
function isContentSink(descriptor) {
  return descriptor.kind === 'property'
    && (
      descriptor.name === 'innerHTML'
      || descriptor.name === 'outerHTML'
      || descriptor.name === 'textContent'
      || descriptor.name === 'innerText'
    )
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
 * @param {unknown} data
 * @param {number[]} coordinate
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @returns {ScopePlan}
 */
function prepareScope(scope, data, coordinate, normalize) {
  return {
    sinks: scope.sinks.map(spec => {
      return prepareSink(spec, data, coordinate, normalize)
    }),
    regions: scope.regions.map(spec => {
      return prepareRegion(spec, data, coordinate, normalize)
    }),
  }
}

/**
 * @param {SinkSpec} spec
 * @param {unknown} data
 * @param {number[]} coordinate
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @returns {SinkPlan}
 */
function prepareSink(spec, data, coordinate, normalize) {
  const projected = projectValue(
    spec.runtime,
    data,
    spec.target,
    spec.matchIndex,
  )
  const resolved = resolveCoordinate(projected, coordinate)

  if (resolved === missing) {
    throw missingCoordinate(spec.runtime, coordinate)
  }

  return {
    spec,
    value: normalize(spec.runtime, resolved),
  }
}

/**
 * @param {RegionSpec} spec
 * @param {unknown} data
 * @param {number[]} coordinate
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @returns {RegionPlan}
 */
function prepareRegion(spec, data, coordinate, normalize) {
  const projected = projectValue(
    spec.runtime,
    data,
    spec.target,
    spec.matchIndex,
  )
  const resolved = resolveCoordinate(projected, coordinate)

  if (resolved === missing) {
    throw missingCoordinate(spec.runtime, coordinate)
  }

  if (resolved === null || resolved === undefined) {
    return {
      spec,
      occurrences: [],
      isArray: false,
      isNoop: true,
    }
  }

  if (spec.isRoot && Array.isArray(resolved)) {
    throw new TypeError(
      'Lumi cannot apply array cardinality at a mounted component root',
    )
  }

  if (Array.isArray(resolved)) {
    for (let index = 0; index < resolved.length; index += 1) {
      if (!Object.hasOwn(resolved, index)) {
        throw new TypeError(
          'Lumi bind projection arrays must be dense',
        )
      }
    }
  }

  const entries = Array.isArray(resolved) ? resolved : [resolved]
  const coordinates = Array.isArray(resolved)
    ? entries.map((_, index) => [...coordinate, index])
    : entries.map(() => coordinate)
  const occurrences = entries.map((entry, index) => {
    const occurrenceCoordinate = coordinates[index] ?? coordinate
    const ownSinks = spec.ownSinks.map(sink => {
      return prepareSink(sink, data, occurrenceCoordinate, normalize)
    })

    if (isTextValue(entry)) {
      return {
        mode: /** @type {const} */ ('text'),
        text: String(entry),
        ownSinks,
      }
    }

    if (entry === null || typeof entry !== 'object') {
      throw new TypeError(
        'Lumi bind projection arrays must contain text values, objects, or arrays',
      )
    }

    return {
      mode: /** @type {const} */ ('context'),
      ownSinks,
      scope: prepareScope(
        spec.scope,
        data,
        occurrenceCoordinate,
        normalize,
      ),
    }
  })

  return {
    spec,
    occurrences,
    isArray: Array.isArray(resolved),
  }
}

/**
 * Reuses a value evaluated at the same selector match before the scalar
 * planner discovered that this update needs cardinality. Deleting on read
 * lets later inherited coordinates evaluate normally.
 *
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {unknown} data
 * @param {number} matchIndex
 * @returns {unknown}
 */
function projectValue(runtime, data, element, matchIndex) {
  if (!Object.hasOwn(runtime.replay, matchIndex)) {
    try {
      return runtime.descriptor.project(data, element)
    } catch (error) {
      throw projectionError(runtime.descriptor, matchIndex, error)
    }
  }

  const projected = runtime.replay[matchIndex]
  delete runtime.replay[matchIndex]
  return projected
}

/**
 * Scalars broadcast through inherited array coordinates. Arrays consume one
 * coordinate at a time, preserving ragged nested shapes.
 *
 * @param {unknown} projected
 * @param {ReadonlyArray<number>} coordinate
 * @returns {unknown}
 */
function resolveCoordinate(projected, coordinate) {
  let current = projected

  for (const index of coordinate) {
    if (!Array.isArray(current)) {
      return current
    }

    if (!Object.hasOwn(current, index)) {
      return missing
    }

    current = current[index]
  }

  return current
}

/**
 * @param {Runtime} runtime
 * @param {ReadonlyArray<number>} coordinate
 */
function missingCoordinate(runtime, coordinate) {
  return new RangeError(
    `Lumi ${runtime.descriptor.kind} projection for `
    + `"${runtime.descriptor.selector}" does not contain array coordinate `
    + `[${coordinate.join(', ')}]`,
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
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
 * @returns {DynamicOperation[]}
 */
function prepareDynamicOperations(
  blueprintRoot,
  scope,
  plan,
  runtimes,
  ownedSubtreePaths,
  data,
  normalize,
  apply,
) {
  const planningRoot = cloneElementTree(blueprintRoot)
  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtPath(
      planningRoot,
      path,
      'Lumi array template lost a binding target',
    )
  })
  /** @type {Map<Runtime, WeakSet<Element>>} */
  const handledByRuntime = new Map(
    runtimes.map(runtime => [runtime, new WeakSet()]),
  )
  /** @type {WeakMap<Element, number[]>} */
  const coordinateByElement = new WeakMap()
  /** @type {WeakMap<Element, ReadonlySet<number>>} */
  const createdBy = new WeakMap()
  /** @type {Array<{
   *   runtime: Runtime,
   *   element: Element,
   * }>} */
  const structuralApplications = []

  coordinateByElement.set(planningRoot, [])

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
    [],
    handledByRuntime,
    coordinateByElement,
  )

  for (const application of structuralApplications) {
    markStructuralCreation(
      application.runtime,
      application.element,
      coordinateByElement,
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
        coordinateByElement,
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
      data,
      coordinateByElement,
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

    const elements = queryOwnedElements(
      planningRoot,
      runtime.descriptor.selector,
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
          data,
          coordinateByElement,
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
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 * @param {(runtime: Runtime, element: Element, value: unknown) => void} apply
 */
function commitDynamicOperations(
  root,
  operations,
  runtimes,
  ownedSubtreePaths,
  apply,
) {
  if (operations.length === 0) {
    return
  }

  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtPath(
      root,
      path,
      'Lumi array template lost a binding target',
    )
  })

  for (const operation of operations) {
    const elements = queryOwnedElements(
      root,
      operation.runtime.descriptor.selector,
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

  refreshDynamicParentCaches(root, runtimes, ownedSubtrees)
}

/**
 * An innerHTML projection may establish content that dynamically discovered
 * descendant rules refine. Cache the final subtree so the next update does
 * not rebuild unchanged markup and discard persistent descendant nodes.
 *
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function refreshDynamicParentCaches(root, runtimes, ownedSubtrees) {
  for (const runtime of runtimes) {
    if (
      runtime.descriptor.kind !== 'property'
      || runtime.descriptor.name !== 'innerHTML'
    ) {
      continue
    }

    for (const element of queryOwnedElements(
      root,
      runtime.descriptor.selector,
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

    const elements = queryOwnedElements(
      root,
      runtime.descriptor.selector,
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

      const depth = dynamicElementDepth(root, element)

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
 * @param {unknown} data
 * @param {WeakMap<Element, number[]>} coordinateByElement
 * @param {(runtime: Runtime, projected: unknown) => unknown} normalize
 * @param {number} matchIndex
 */
function prepareDynamicValue(
  runtime,
  element,
  data,
  coordinateByElement,
  normalize,
  matchIndex,
) {
  const coordinate = findCoordinate(element, coordinateByElement)
  const projected = projectValue(runtime, data, element, matchIndex)
  const resolved = resolveCoordinate(projected, coordinate)

  if (resolved === missing) {
    throw missingCoordinate(runtime, coordinate)
  }

  if (runtime.descriptor.kind === 'bind' && Array.isArray(resolved)) {
    throw new TypeError(
      `Lumi array bind selector "${runtime.descriptor.selector}" `
      + 'must match the component template',
    )
  }

  if (
    runtime.descriptor.kind === 'property'
    && runtime.descriptor.name === 'outerHTML'
  ) {
    throw new TypeError(
      'Lumi outerHTML binding targets created during array planning '
      + 'must exist in the component template',
    )
  }

  return normalize(runtime, resolved)
}

/**
 * @param {Runtime} runtime
 */
function isStructuralRuntime(runtime) {
  return runtime.descriptor.kind === 'bind'
    || isContentSink(runtime.descriptor)
}

/**
 * @param {Element} element
 * @param {WeakMap<Element, number[]>} coordinateByElement
 * @returns {number[]}
 */
function findCoordinate(element, coordinateByElement) {
  let current = /** @type {Element | null} */ (element)

  while (current !== null) {
    const coordinate = coordinateByElement.get(current)

    if (coordinate !== undefined) {
      return coordinate
    }

    current = shadowIncludingParent(current)
  }

  throw new Error('Lumi lost a dynamic array coordinate')
}

/**
 * @param {Element} root
 * @param {Element} element
 */
function dynamicElementDepth(root, element) {
  let depth = 0
  let current = element

  while (current !== root) {
    const parent = shadowIncludingParent(current)

    if (parent === null) {
      throw new Error('Lumi lost a dynamic DOM target')
    }

    current = parent
    depth += 1
  }

  return depth
}

/**
 * Records the statically compiled targets after their inert cardinality plan
 * has been applied. This traversal exists only in the mixed structural path;
 * the live cardinality state retains its original fast apply methods.
 *
 * @param {ScopeState} state
 * @param {ScopePlan} plan
 * @param {number[]} coordinate
 * @param {Map<Runtime, WeakSet<Element>>} handledByRuntime
 * @param {WeakMap<Element, number[]>} coordinateByElement
 */
function trackPlannedScope(
  state,
  plan,
  coordinate,
  handledByRuntime,
  coordinateByElement,
) {
  for (let index = 0; index < plan.sinks.length; index += 1) {
    const sink = plan.sinks[index]
    const element = state.sinkElements[index]

    if (sink !== undefined && element !== undefined) {
      handledByRuntime.get(sink.spec.runtime)?.add(element)
      coordinateByElement.set(element, coordinate)
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
      const occurrenceCoordinate = regionPlan.isArray
        ? [...coordinate, occurrenceIndex]
        : coordinate

      if (occurrencePlan === undefined || occurrenceState === undefined) {
        continue
      }

      handledByRuntime.get(regionPlan.spec.runtime)
        ?.add(occurrenceState.element)
      coordinateByElement.set(
        occurrenceState.element,
        occurrenceCoordinate,
      )

      for (const sink of occurrencePlan.ownSinks) {
        handledByRuntime.get(sink.spec.runtime)?.add(occurrenceState.element)
      }

      if (
        occurrencePlan.mode === 'context'
        && occurrencePlan.scope !== undefined
        && occurrenceState.scope !== null
      ) {
        trackPlannedScope(
          occurrenceState.scope,
          occurrencePlan.scope,
          occurrenceCoordinate,
          handledByRuntime,
          coordinateByElement,
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
 * @param {WeakMap<Element, number[]>} coordinateByElement
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 */
function markStructuralCreation(
  runtime,
  element,
  coordinateByElement,
  createdBy,
) {
  const descriptor = runtime.descriptor

  if (descriptor.kind !== 'property') {
    return
  }

  const coordinate = findCoordinate(element, coordinateByElement)
  const history = new Set(createdBy.get(element) ?? [])
  history.add(runtime.index)

  if (descriptor.name === 'innerHTML') {
    for (const child of element.children) {
      markCreatedSubtree(
        child,
        coordinate,
        history,
        coordinateByElement,
        createdBy,
      )
    }
  }
}

/**
 * @param {Element} element
 * @param {number[]} coordinate
 * @param {ReadonlySet<number>} history
 * @param {WeakMap<Element, number[]>} coordinateByElement
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 */
function markCreatedSubtree(
  element,
  coordinate,
  history,
  coordinateByElement,
  createdBy,
) {
  coordinateByElement.set(element, coordinate)
  createdBy.set(element, history)

  for (const child of element.children) {
    markCreatedSubtree(
      child,
      coordinate,
      history,
      coordinateByElement,
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
    this.spec = spec
    this.applyValue = apply
    this.sinkElements = spec.sinks.map(sink => {
      return elementAtPath(
        root,
        sink.path,
        'Lumi array template lost a binding target',
      )
    })
    this.regions = spec.regions.map(region => {
      return new RegionState(
        elementAtPath(
          root,
          region.path,
          'Lumi array template lost a binding target',
        ),
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

    while (this.occurrences.length < plan.occurrences.length) {
      const element = /** @type {Element} */ (
        importElementTree(this.anchor.ownerDocument, this.spec.target)
      )
      this.anchor.parentNode?.insertBefore(element, this.anchor)
      this.occurrences.push(new OccurrenceState(element))
    }

    while (this.occurrences.length > plan.occurrences.length) {
      this.occurrences.pop()?.destroy()
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
   * @param {OccurrenceState} occurrence
   * @param {OccurrencePlan} plan
   */
  applyOccurrence(occurrence, plan) {
    if (plan.mode === 'text') {
      occurrence.scope?.destroy()
      occurrence.scope = null

      if (occurrence.element.textContent !== plan.text) {
        occurrence.element.textContent = plan.text ?? ''
      }
      occurrence.mode = 'text'
    } else {
      if (occurrence.mode !== 'context' || occurrence.scope === null) {
        if (
          occurrence.mode !== 'unknown'
          || !canResolveScope(occurrence.element, this.spec.scope)
        ) {
          restoreTemplateChildren(occurrence.element, this.spec.target)
        }
        occurrence.scope = new ScopeState(
          occurrence.element,
          this.spec.scope,
          this.applyValue,
        )
      }
      occurrence.mode = 'context'
    }

    for (const sink of plan.ownSinks) {
      this.applyValue(sink.spec.runtime, occurrence.element, sink.value)
    }

    if (plan.mode === 'context' && plan.scope !== undefined) {
      occurrence.scope?.apply(plan.scope)
    }
  }

  destroy() {
    for (const occurrence of this.occurrences) {
      occurrence.destroy()
    }
    this.occurrences = []
    this.anchor.remove()
  }
}

class OccurrenceState {
  /** @param {Element} element */
  constructor(element) {
    this.element = element
    /** @type {'unknown' | 'text' | 'context'} */
    this.mode = 'unknown'
    /** @type {ScopeState | null} */
    this.scope = null
  }

  destroy() {
    this.scope?.destroy()
    this.scope = null
    this.element.remove()
  }
}

/**
 * @param {Element} element
 * @param {Element} template
 */
function restoreTemplateChildren(element, template) {
  const children = Array.from(
    template.childNodes,
    child => element.ownerDocument.importNode(child, true),
  )
  element.replaceChildren(...children)
}

/**
 * Preserves existing descendants when their template locations are already
 * present. A prior scalar text write may have removed them, in which case the
 * pristine template is restored before the context becomes active again.
 *
 * @param {Element} root
 * @param {ScopeSpec} scope
 */
function canResolveScope(root, scope) {
  try {
    for (const sink of scope.sinks) {
      elementAtPath(
        root,
        sink.path,
        'Lumi array template lost a binding target',
      )
    }
    for (const region of scope.regions) {
      elementAtPath(
        root,
        region.path,
        'Lumi array template lost a binding target',
      )
    }
    return true
  } catch {
    return false
  }
}

/**
 * @param {Element} root
 * @param {string} selector
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function queryOwnedElements(root, selector, ownedSubtrees) {
  return queryElements(root, selector).filter(element => {
    return !ownedSubtrees.some(owned => {
      return owned !== element
        && shadowIncludingContains(owned, element)
    })
  })
}
