// @ts-check

/**
 * Moves an existing child without discarding browser-managed state when the
 * browser supports atomic DOM moves.
 *
 * @param {Element} container
 * @param {Element} element
 * @param {Element | null} anchor
 */
export function moveElementBefore(container, element, anchor) {
  const nativeMoveBefore = Reflect.get(container, 'moveBefore')

  if (typeof nativeMoveBefore === 'function') {
    Reflect.apply(nativeMoveBefore, container, [element, anchor])
    return
  }

  container.insertBefore(element, anchor)
}

/**
 * Returns the positions of the longest increasing sequence of nonzero values.
 * Zero represents a newly mounted item that has no old position.
 *
 * @param {ReadonlyArray<number>} values
 * @returns {Set<number>}
 */
export function longestIncreasingSubsequencePositions(values) {
  const predecessors = new Array(values.length).fill(-1)
  /** @type {number[]} */
  const tails = []

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]

    if (value === undefined || value === 0) {
      continue
    }

    let low = 0
    let high = tails.length

    while (low < high) {
      const middle = (low + high) >>> 1
      const tailIndex = tails[middle]
      const tailValue = tailIndex === undefined
        ? undefined
        : values[tailIndex]

      if (tailValue !== undefined && tailValue < value) {
        low = middle + 1
      } else {
        high = middle
      }
    }

    if (low > 0) {
      predecessors[index] = tails[low - 1] ?? -1
    }

    tails[low] = index
  }

  const positions = new Set()
  let position = tails.at(-1) ?? -1

  while (position !== -1) {
    positions.add(position)
    position = predecessors[position] ?? -1
  }

  return positions
}
