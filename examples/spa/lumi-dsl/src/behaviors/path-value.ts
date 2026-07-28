import {jsonPath} from '../../../../data-path.js'

import type {ProjectionContext, TextValue} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export type PathContext = ProjectionContext<unknown, Presentation>

export function pathMatches(
  context: PathContext,
  path: string | undefined,
): unknown[] {
  if (path === '$.item') {
    return [context.item]
  }

  if (path !== undefined && isSimplePath(path)) {
    return simplePathMatches(context, path)
  }

  return jsonPath(context, path)
}

export function pathScalar(
  context: PathContext,
  path: string | undefined,
): unknown {
  return pathMatches(context, path)[0]
}

export function pathText(
  context: PathContext,
  path: string | undefined,
  label: string,
): TextValue | null | undefined {
  const value = pathScalar(context, path)

  if (
    value === undefined
    || value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value
  }

  throw new TypeError(`${label} must resolve to text-compatible data`)
}

export function pathBoolean(
  context: PathContext,
  path: string | undefined,
  label: string,
): boolean | null | undefined {
  const value = pathScalar(context, path)

  if (
    value === undefined
    || value === null
    || typeof value === 'boolean'
  ) {
    return value
  }

  throw new TypeError(`${label} must resolve to a boolean`)
}

export function pathString(
  context: PathContext,
  path: string | undefined,
  label: string,
): string | null | undefined {
  const value = pathScalar(context, path)

  if (
    value === undefined
    || value === null
    || typeof value === 'string'
  ) {
    return value
  }

  throw new TypeError(`${label} must resolve to a string`)
}

export function declarationPath(
  element: Element,
  attribute: string,
  name: string,
): string {
  const declaration = element.getAttribute(attribute)
  const prefix = `${name}: `

  if (declaration === null || !declaration.startsWith(prefix)) {
    throw new TypeError(`${attribute} must declare "${prefix}<JSONPath>"`)
  }

  return declaration.slice(prefix.length)
}

function isSimplePath(path: string): boolean {
  return /^\$\.(?:data|item)(?:\.[A-Za-z_$][\w$]*)*$/.test(path)
}

function simplePathMatches(
  context: PathContext,
  path: string,
): unknown[] {
  let value: unknown = context

  for (const property of path.slice(2).split('.')) {
    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
      || !Object.hasOwn(value, property)
    ) {
      return []
    }

    value = Reflect.get(value, property)
  }

  return [value]
}
