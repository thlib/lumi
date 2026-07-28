// @ts-check

import {component} from '../../../../dist/lumi.js'

import type {Binding, MountedComponent} from '../../../../dist/lumi.js'

/**
 * Demo-owned registry populated by the view-document build. Page
 * composition and routing remain in application.js.
 */

export interface DefinitionOptions<Data, Presentation = Data> {
  template: HTMLTemplateElement | null
  bindings?: readonly Binding<Presentation>[]
  present(data: Data): Presentation
}

interface Definition {
  mount(target: Element | null): MountedComponent<unknown>
  present(data: unknown): unknown
}

const definitions = new Map<string, Definition>()

/**
 * Installs the definitions generated from component and page filenames.
 *
 */
export function installDefinitions(
  declarations: readonly (readonly [
    string,
    | DefinitionOptions<unknown, unknown>
    | (() => DefinitionOptions<unknown, unknown>),
  ])[],
): void {
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
 */
export function resolve(name: string): Definition {
  const definition = definitions.get(name)

  if (definition === undefined) {
    throw new Error(`Component "${name}" is not defined`)
  }

  return definition
}
