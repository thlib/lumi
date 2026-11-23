// @ts-check

import {DEV} from './dev.js'
import {messages} from './messages.js'

/**
 * Throws an error that Lumi found. This function has the only `throw`
 * statement for such errors.
 *
 * The development version gives the code and a sentence. The production
 * version gives the code and the details. API.md lists the codes.
 *
 * @internal
 * @param {number} code
 * @param {...unknown} details
 * @returns {never}
 */
export function fail(code, ...details) {
  throw new Error(
    DEV
      ? `Lumi E${code}: ${
        /** @type {(...details: any[]) => string} */ (messages[code])(...details)
      }`
      : ['Lumi E' + code, ...details].join(' '),
  )
}
