// @ts-check

/**
 * The result of a match of integer keys.
 *
 * - `sources`: the previous index of each new key, or -1 for a new key.
 * - `flags`: for each new key, 1 when its occurrence must not move (valid
 *   only when `ordered` is false). After these, for each previous key, 1
 *   when a new key uses its occurrence.
 * - `ordered`: true when the survivors kept their relative order.
 *
 * @typedef {{sources: Int32Array, flags: Uint8Array, ordered: boolean}} KeyMatch
 */

/**
 * @param {unknown} key
 * @returns {key is number}
 */
function isIntegerKey(key) {
  return typeof key === 'number' && (key | 0) === key
}

/**
 * Finds the previous occurrence of each new key when all keys are 32-bit
 * integers. A lookup table in a typed array replaces a Map.
 *
 * Two items can have the same key. Each previous occurrence serves one
 * item, in the order of the lists.
 *
 * @param {ReadonlyArray<unknown>} previousKeys
 * @param {ReadonlyArray<unknown>} keys
 * @returns {KeyMatch | null} null when a key is not a 32-bit integer
 */
export function matchIntegerKeys(previousKeys, keys) {
  const previousCount = previousKeys.length
  const count = keys.length
  // String keys use the Map matcher and need no integer lookup table.
  if (
    (previousCount > 0 && !isIntegerKey(previousKeys[0]))
    || (count > 0 && !isIntegerKey(keys[0]))
  ) {
    return null
  }
  let size = 4

  while (size < previousCount * 2) {
    size *= 2
  }

  const shift = Math.clz32(size) + 1
  const mask = size - 1
  // A slot holds the previous index + 1. Zero is an empty slot.
  const table = new Int32Array(size)
  const previous = new Int32Array(previousCount)

  for (let index = 0; index < previousCount; index += 1) {
    const key = previousKeys[index]

    if (!isIntegerKey(key)) {
      return null
    }
    previous[index] = key

    let slot = Math.imul(key, 0x9e3779b1) >>> shift

    while (table[slot] !== 0) {
      slot = (slot + 1) & mask
    }
    table[slot] = index + 1
  }

  const sources = new Int32Array(count)
  const flags = new Uint8Array(count + previousCount)
  let ordered = true
  let last = -1

  for (let index = 0; index < count; index += 1) {
    const key = keys[index]

    if (!isIntegerKey(key)) {
      return null
    }

    let slot = Math.imul(key, 0x9e3779b1) >>> shift
    let source = -1

    for (let entry; (entry = /** @type {number} */ (table[slot])) !== 0;) {
      if (previous[entry - 1] === key && flags[count + entry - 1] === 0) {
        flags[count + entry - 1] = 1
        source = entry - 1
        break
      }
      slot = (slot + 1) & mask
    }

    sources[index] = source

    if (source !== -1) {
      if (source < last) {
        ordered = false
      }
      last = source
    }
  }

  if (!ordered) {
    markStable(sources, flags)
  }

  return {sources, flags, ordered}
}

/**
 * @param {Int32Array} sources
 * @returns {Uint8Array} 1 at each index that must not move
 */
export function stableOccurrences(sources) {
  const stable = new Uint8Array(sources.length)

  markStable(sources, stable)
  return stable
}

/**
 * Marks the surviving occurrences that stay in place during a keyed reorder:
 * the longest run of survivors whose previous DOM order is already the new
 * relative order.
 *
 * @param {Int32Array} sources
 * @param {Uint8Array} stable
 */
function markStable(sources, stable) {
  const length = sources.length
  const tails = new Int32Array(length)
  const predecessors = new Int32Array(length)
  let longest = 0

  for (let index = 0; index < length; index += 1) {
    const source = /** @type {number} */ (sources[index])

    if (source === -1) {
      continue
    }

    // A survivor that extends the longest run needs no search.
    let low = longest
    let high = longest - 1

    if (
      longest > 0
      && /** @type {number} */ (sources[/** @type {number} */ (tails[high])]) >= source
    ) {
      low = 0
    }

    while (low < high) {
      const middle = (low + high) >>> 1
      const tail = /** @type {number} */ (tails[middle])

      if (/** @type {number} */ (sources[tail]) < source) {
        low = middle + 1
      } else {
        high = middle
      }
    }

    predecessors[index] = low > 0
      ? /** @type {number} */ (tails[low - 1])
      : -1
    tails[low] = index

    if (low === longest) {
      longest += 1
    }
  }

  let index = longest > 0 ? /** @type {number} */ (tails[longest - 1]) : -1

  while (index !== -1) {
    stable[index] = 1
    index = /** @type {number} */ (predecessors[index])
  }
}
