// @ts-check

import {JsonPathEval, JsonPathParser} from './vendor/json-path.js'

/** @type {Map<string, (data: unknown) => unknown[]>} */
const queryByPath = new Map()

/**
 * Evaluates one RFC 9535 JSONPath query without coercing nodelist cardinality.
 *
 * @param {unknown} data
 * @param {string | undefined} path
 * @returns {unknown[]}
 */
export function jsonPath(data, path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError('JSONPath requires a path')
  }

  let query = queryByPath.get(path)

  if (query === undefined) {
    const parsed = JsonPathParser.parse(path)

    if (!parsed.success) {
      throw new TypeError(`Invalid JSONPath "${path}": ${parsed.error}`)
    }

    query = value => JsonPathEval.run(parsed.path, value).map(
      /** @param {{data: unknown}} match */
      match => match.data,
    )
    queryByPath.set(path, query)
  }

  return query(data)
}
