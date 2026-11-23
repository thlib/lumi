import {jsonPath} from '../../../../data-path.js'

import type {ProjectionContext, TextValue} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export type PathContext = ProjectionContext<unknown, Presentation>

export function pathMatches(
  context: PathContext,
  path: string | undefined,
): unknown[] {
  const value = readSimplePath(context, path)
  if (value === complexPath) {
    return jsonPath(context, path)
  }
  return value === missing ? [] : [value]
}

export function pathScalar(
  context: PathContext,
  path: string | undefined,
): unknown {
  const value = readSimplePath(context, path)
  if (value === complexPath) {
    return jsonPath(context, path)[0]
  }
  return value === missing ? undefined : value
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

const missing = Symbol()
const complexPath = Symbol()
const simplePath = /^\$\.(?:data|item)(?:\.[A-Za-z_$][\w$]*)*$/
let lastPath: string | undefined
let cachedFields: readonly string[] | null = null

function readSimplePath(context: PathContext, path: string | undefined): unknown {
  if (path === '$.item') {
    return context.item
  }

  // Consecutive rows often read the same path.
  if (path !== lastPath) {
    cachedFields = path !== undefined && simplePath.test(path)
      ? path.slice(2).split('.')
      : null
    lastPath = path
  }

  // A getter can read another path and replace the cached fields.
  const fields = cachedFields
  if (fields === null) {
    return complexPath
  }

  let value: unknown = context
  for (let index = 0; index < fields.length; index += 1) {
    const property = fields[index]!

    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
      || !Object.hasOwn(value, property)
    ) {
      return missing
    }
    value = Reflect.get(value, property)
  }
  return value
}
