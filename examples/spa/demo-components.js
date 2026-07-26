// @ts-check

import {bind} from '../../src/index.js'

/**
 * Demo-owned component orchestration.
 *
 * These utilities are ordinary application JavaScript, not Lumi APIs. Another
 * application using Lumi can organize its components with different utilities
 * or with a framework.
 *
 * A definition pairs one Lumi component with the projection that turns
 * application data into the snapshot that component renders. Definitions run
 * on first use, so a component may resolve a child that a later script in the
 * document defines.
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   component: import('../../src/types.js').Component<any>,
 *   present: (data: Data) => any,
 * }} Definition
 */

/** @type {Map<string, () => Definition>} */
const definitions = new Map()

/** @type {Map<string, Definition>} */
const resolved = new Map()

/**
 * Declares one named component definition.
 *
 * @param {string} name
 * @param {() => Definition} define_
 */
export function define(name, define_) {
  if (definitions.has(name)) {
    throw new Error(`Component "${name}" is already defined`)
  }

  definitions.set(name, define_)
}

/**
 * Returns one defined component, creating it on first use.
 *
 * @param {string} name
 * @returns {Definition}
 */
export function resolve(name) {
  const existing = resolved.get(name)

  if (existing !== undefined) {
    return existing
  }

  const define_ = definitions.get(name)

  if (define_ === undefined) {
    throw new Error(`Component "${name}" is not defined`)
  }

  const definition = define_()
  resolved.set(name, definition)
  return definition
}

/**
 * Creates the application-owned data-path binding used by each component.
 *
 * @template Data
 * @returns {import('../../src/types.js').Binding<Data>}
 */
export function bindData() {
  return bind(
    '[data-bind]',
    (data, element) => dataPath(data, element.getAttribute('data-bind')),
  )
}

/** @type {Map<string, string[]>} */
const segmentsByPath = new Map()

/**
 * Resolves one application-owned data path against a snapshot. Named members
 * distribute through arrays, so `$.projects.name` produces one name per
 * project. Lumi receives only the resulting JavaScript values and does not
 * interpret this convention.
 *
 * @template Value
 * @param {unknown} data
 * @param {string | null} path
 * @returns {Value}
 */
export function dataPath(data, path) {
  if (path === null) {
    throw new TypeError('A data path is required')
  }

  let segments = segmentsByPath.get(path)

  if (segments === undefined) {
    segments = compilePath(path)
    segmentsByPath.set(path, segments)
  }

  let value = data

  for (const segment of segments) {
    value = selectMember(value, segment)
  }

  return /** @type {Value} */ (value)
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function compilePath(path) {
  const segments = path.split('.')

  if (segments.shift() !== '$' || segments.includes('')) {
    throw new TypeError(`"${path}" is not a supported data path`)
  }

  return segments
}

/**
 * @param {unknown} value
 * @param {string} segment
 * @returns {unknown}
 */
function selectMember(value, segment) {
  if (Array.isArray(value)) {
    return value.map(item => selectMember(item, segment))
  }

  return typeof value === 'object'
    && value !== null
    && Object.hasOwn(value, segment)
    ? Reflect.get(value, segment)
    : undefined
}
