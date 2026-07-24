// @ts-check

/**
 * Internal marker for a nullish projection that deliberately performs no DOM
 * operation. This module is not exported from Lumi's package entry point.
 *
 * @internal
 */
export const noValue = Symbol('Lumi no projected value')

/**
 * @param {unknown} value
 * @returns {value is typeof noValue}
 * @internal
 */
export function isNoValue(value) {
  return value === noValue
}
