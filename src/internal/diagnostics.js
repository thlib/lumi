// @ts-check

/**
 * Writes one warning to the console. Only the development version calls
 * this function. The optional global selects the console of the document
 * that holds the mounted DOM.
 *
 * @internal
 * @param {string} message The text after "Lumi: ".
 * @param {typeof globalThis | Window | null} [target]
 */
export function warn(message, target = globalThis) {
  /** @type {any} */ (target ?? globalThis).console?.warn?.(`Lumi: ${message}`)
}
