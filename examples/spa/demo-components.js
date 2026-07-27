// @ts-check

/**
 * Demo-owned component orchestration.
 *
 * These utilities are ordinary application JavaScript, not Lumi APIs. Another
 * application using Lumi can organize its components with different utilities
 * or with a framework.
 *
 * A definition provides an ordered stack of inline component specifications
 * and reusable definitions. Definitions run on first use, so a stack may
 * resolve another stack that a later script in the document defines.
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   template: HTMLTemplateElement | null,
 *   bindings?: ReadonlyArray<import('../../src/types.js').Binding<any>>,
 *   present: (data: Data) => any,
 * }} InlineComponent
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   at?: string,
 *   select?: (data: Data) => any,
 * } & (
 *   {use: Definition}
 *   | InlineComponent<Data>
 * )} ComponentEntry
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   components: ReadonlyArray<ComponentEntry<Data>>,
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
