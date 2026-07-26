// @ts-check

import {bind} from '../../src/index.js'
import {jsonPath} from './plain.js'

/**
 * Demo-owned component orchestration.
 *
 * These utilities are ordinary application JavaScript, not Lumi APIs. Another
 * application using Lumi can organize its components with different utilities
 * or with a framework.
 */

/** @typedef {import('../../src/types.js').Component<any>} RegisteredComponent */
/** @typedef {(name: string) => RegisteredComponent} Resolver */

/**
 * @typedef {object} DefinitionContext
 * @property {Resolver} resolve
 * @property {<Data, Presentation>(
 *   presenter: (data: Data) => Presentation,
 * ) => void} present
 */

/** @type {Map<string, (data: unknown) => unknown>} */
const presenters = new Map()

/** @type {Map<string, (context: DefinitionContext) => RegisteredComponent>} */
const factories = new Map()

/** @type {Map<string, RegisteredComponent>} */
const components = new Map()

/**
 * Creates the application-owned data-path binding used by each component.
 *
 * @template Data
 * @returns {import('../../src/types.js').Binding<Data>}
 */
export function bindData() {
  return bind(
    '[data-bind]',
    (data, element) => {
      return jsonPath(
        data,
        element.getAttribute('data-bind') ?? undefined,
      )
    },
  )
}

/**
 * Defines a component and its optional presentation hook. Native behavior is
 * declared by the component itself with Lumi's on() binding.
 *
 * @param {string} name
 * @param {(context: DefinitionContext) => RegisteredComponent} factory
 */
export function define(name, factory) {
  if (factories.has(name)) {
    throw new Error(`Component "${name}" is already defined`)
  }

  factories.set(name, factory)
}

/**
 * Resolves one registered component, including its child dependencies.
 *
 * @param {string} name
 * @returns {RegisteredComponent}
 */
export function resolve(name) {
  const existing = components.get(name)

  if (existing !== undefined) {
    return existing
  }

  const factory = factories.get(name)

  if (factory === undefined) {
    throw new Error(`Component "${name}" is not defined`)
  }

  const resolved = factory(Object.freeze({
    resolve,

    present(presenter) {
      registerPresenter(name, presenter)
    },
  }))
  components.set(name, resolved)
  return resolved
}

/**
 * @template Data
 * @template Presentation
 * @param {string} name
 * @param {(data: Data) => Presentation} presenter
 */
function registerPresenter(name, presenter) {
  if (presenters.has(name)) {
    throw new Error(`Component presenter "${name}" is already registered`)
  }

  presenters.set(
    name,
    data => presenter(/** @type {Data} */ (data)),
  )
}

/**
 * Presents one registered component from application data.
 *
 * Selecting presentations here keeps application scheduling outside Lumi:
 * independently mounted components are presented only when the application
 * chooses to update them.
 *
 * @template Data
 * @param {string} name
 * @param {Data} data
 * @returns {unknown}
 */
export function present(name, data) {
  const presenter = presenters.get(name)

  if (presenter === undefined) {
    throw new Error(`Component presenter "${name}" is not registered`)
  }

  return presenter(data)
}
