// @ts-check

import {component} from '../../../../dist/lumi.js'

/**
 * Demo-owned registry populated by the view-document build. Page
 * composition and routing remain in application.js.
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   template: HTMLTemplateElement | null,
 *   bindings?: ReadonlyArray<import('../../../../dist/lumi.js').Binding<any>>,
 *   present: (data: Data) => any,
 * }} DefinitionOptions
 */

/**
 * @typedef {{
 *   mount: (target: Element | null) => import('../../../../dist/lumi.js').MountedComponent<any>,
 *   present: (data: any) => any,
 * }} Definition
 */

/** @type {Map<string, Definition>} */
const definitions = new Map()

/**
 * Installs the definitions generated from component and page filenames.
 *
 * @param {ReadonlyArray<readonly [
 *   string,
 *   DefinitionOptions | (() => DefinitionOptions),
 * ]>} declarations
 */
export function installDefinitions(declarations) {
  if (definitions.size > 0) {
    throw new Error('Component definitions are already installed')
  }

  for (const [name, declaration] of declarations) {
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
