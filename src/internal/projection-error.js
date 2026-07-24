// @ts-check

/**
 * Adds the binding location to an error raised by application projection code.
 * The original thrown value remains available as the standard error cause.
 *
 * @param {{ kind: string, selector: string }} descriptor
 * @param {number} matchIndex
 * @param {unknown} error
 * @returns {Error}
 */
export function projectionError(descriptor, matchIndex, error) {
  const detail = error instanceof Error
    ? error.message
    : String(error)

  return new Error(
    `Lumi ${descriptor.kind} projection for "${descriptor.selector}" `
    + `at matched position ${matchIndex + 1} failed: ${detail}`,
    { cause: error },
  )
}
