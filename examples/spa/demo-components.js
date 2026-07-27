// @ts-check

import {component} from '../../src/index.js'

/**
 * Demo-owned registry that keeps behavior declarations beside native
 * templates. Page composition and routing remain in application.js.
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   template: HTMLTemplateElement | null,
 *   bindings?: ReadonlyArray<import('../../src/types.js').Binding<any>>,
 *   present: (data: Data) => any,
 * }} DefinitionOptions
 */

/**
 * @typedef {{
 *   mount: (target: Element | null) => import('../../src/types.js').MountedComponent<any>,
 *   present: (data: any) => any,
 * }} Definition
 */

/** @type {Map<string, Definition>} */
const definitions = new Map()

/**
 * Registers one component's template, behavior, and presentation function.
 *
 * @param {string} name
 * @param {DefinitionOptions | (() => DefinitionOptions)} declaration
 */
export function define(name, declaration) {
  if (definitions.has(name)) {
    throw new Error(`Component "${name}" is already defined`)
  }

  const options = typeof declaration === 'function'
    ? declaration()
    : declaration
  const renderer = component(options.bindings === undefined
    ? {template: options.template}
    : {template: options.template, bindings: options.bindings})

  definitions.set(name, {
    mount: renderer.mount,
    present: options.present,
  })
}

/**
 * Resolves one previously registered component.
 *
 * @param {string} name
 * @returns {Definition}
 */
export function resolve(name) {
  const definition = definitions.get(name)

  if (definition === undefined) {
    throw new Error(`Component "${name}" is not defined`)
  }

  return definition
}
