// @ts-check

/**
 * Adds the binding location to an error raised by application projection code.
 * The original thrown value remains available as the standard error cause.
 *
 * @param {{ kind: string, selector: string }} descriptor
 * @param {number} matchIndex
 * @param {unknown} error
 * @param {number} [item] The item index when a repeat key projection failed.
 * @returns {Error}
 */
export function projectionError(descriptor, matchIndex, error, item) {
  const detail = error instanceof Error
    ? error.message
    : String(error)

  return new Error(
    `Lumi ${descriptor.kind}${item === undefined ? '' : ' key'} projection `
    + `for "${descriptor.selector}" at matched position ${matchIndex + 1}`
    + `${item === undefined ? '' : `, item ${item + 1}`} failed: ${detail}`,
    { cause: error },
  )
}
