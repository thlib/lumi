// @ts-check

/**
 * Delegates one native event to descendants matching a selector.
 *
 * @param {Element | null} root
 * @param {string} type
 * @param {string} selector
 * @param {(event: Event, element: Element) => void} handle
 * @param {boolean | AddEventListenerOptions} [options]
 * @returns {() => void}
 */
export function on(root, type, selector, handle, options = false) {
  if (!(root instanceof Element)) {
    throw new TypeError('Event root must be an element')
  }

  /** @param {Event} event */
  const listener = event => {
    if (!(event.target instanceof Element)) {
      return
    }

    const element = event.target.closest(selector)

    if (element !== null && root.contains(element)) {
      handle(event, element)
    }
  }

  root.addEventListener(type, listener, options)

  return () => root.removeEventListener(type, listener, options)
}

/** @type {Map<string, (data: unknown) => unknown>} */
const queryByPath = new Map()

/**
 * Resolves one application-owned data path against a snapshot.
 *
 * Named members distribute through arrays while preserving their nested
 * shape. Lumi receives only the resulting JavaScript values and does not
 * interpret this convention.
 *
 * @template Value
 * @param {unknown} data
 * @param {string | undefined} path
 * @returns {Value}
 */
export function jsonPath(data, path) {
  if (path === undefined) {
    throw new TypeError('JSONPath requires a path')
  }

  let query = queryByPath.get(path)

  if (query === undefined) {
    query = compileJsonPath(path)
    queryByPath.set(path, query)
  }

  return /** @type {Value} */ (query(data))
}

/**
 * Compiles the path forms used by the examples: the root `$`, dot member
 * names, quoted bracket member names, and array indexes. Named members
 * distribute through arrays so `$.items.name` produces one name per item.
 *
 * This is application-side projection behavior, not Lumi template syntax.
 *
 * @param {string} path
 * @returns {(data: unknown) => unknown}
 */
function compileJsonPath(path) {
  if (!path.startsWith('$')) {
    throw invalidJsonPath(path)
  }

  /** @type {Array<string | number>} */
  const segments = []
  let position = 1

  while (position < path.length) {
    const remainder = path.slice(position)
    const name = /^\.([A-Za-z_$][\w$]*)/.exec(remainder)

    if (name !== null) {
      segments.push(/** @type {string} */ (name[1]))
      position += name[0].length
      continue
    }

    const index = /^\[(-?(?:0|[1-9]\d*))\]/.exec(remainder)

    if (index !== null) {
      segments.push(Number(index[1]))
      position += index[0].length
      continue
    }

    const quotedName = /^\[("(?:[^"\\]|\\.)*")\]/.exec(remainder)

    if (quotedName === null) {
      throw invalidJsonPath(path)
    }

    try {
      segments.push(JSON.parse(/** @type {string} */ (quotedName[1])))
    } catch {
      throw invalidJsonPath(path)
    }

    position += quotedName[0].length
  }

  return data => segments.reduce(selectSegment, data)
}

/**
 * @param {unknown} value
 * @param {string | number} segment
 * @returns {unknown}
 */
function selectSegment(value, segment) {
  if (Array.isArray(value) && typeof segment === 'string') {
    return value.map(item => selectSegment(item, segment))
  }

  const key = typeof segment === 'number'
    && segment < 0
    && Array.isArray(value)
    ? value.length + segment
    : segment

  if (
    (typeof value !== 'object' || value === null)
    || !Object.hasOwn(value, key)
  ) {
    return undefined
  }

  return Reflect.get(value, key)
}

/**
 * @param {string} path
 * @returns {TypeError}
 */
function invalidJsonPath(path) {
  return new TypeError(`"${path}" is not a supported data path`)
}
