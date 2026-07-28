// @ts-check

/**
 * Returns accessible copy for the invalid states used by the invite form.
 * The browser remains the source of truth for email syntax.
 *
 * @param {HTMLInputElement} input
 * @returns {string}
 */
export function emailValidationMessage(input: HTMLInputElement): string {
  if (input.validity.valueMissing) {
    return 'Enter an email address.'
  }

  if (input.validity.typeMismatch) {
    return 'Enter a valid email address.'
  }

  return ''
}
