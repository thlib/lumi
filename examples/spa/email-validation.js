// @ts-check

import {on} from '../../dist/lumi.js'

/**
 * Applies inline email validation to forms marked with data-validate="email".
 * Each email input must name its error element with aria-describedby.
 */
export const emailValidation = [
  on('form[data-validate="email"]', 'submit', (e, el) => {
    if (!(el instanceof HTMLFormElement)) {
      throw new TypeError('Email validation requires a form')
    }

    validatedForms.add(el)

    if (!validate(el)) {
      e.preventDefault()
    }
  }, {capture: true}),
  on('form[data-validate="email"] input[type="email"]', 'input', (_, el) => {
    if (!(el instanceof HTMLInputElement)) {
      throw new TypeError('Email validation requires an input')
    }

    if (el.form !== null && validatedForms.has(el.form)) {
      showError(el, emailValidationMessage(el))
    }
  }),
  on('form[data-validate="email"]', 'reset', (_, el) => {
    if (!(el instanceof HTMLFormElement)) {
      throw new TypeError('Email validation requires a form')
    }

    validatedForms.delete(el)

    for (const input of el.querySelectorAll('input[type="email"]')) {
      if (input instanceof HTMLInputElement) {
        showError(input, '')
      }
    }
  }),
]

const validatedForms = new WeakSet()

/**
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function validate(form) {
  /** @type {HTMLInputElement | undefined} */
  let firstInvalid

  for (const input of form.querySelectorAll('input[type="email"]')) {
    if (!(input instanceof HTMLInputElement)) {
      continue
    }

    input.value = input.value.trim()
    const message = emailValidationMessage(input)
    showError(input, message)

    if (message !== '' && firstInvalid === undefined) {
      firstInvalid = input
    }
  }

  firstInvalid?.focus()
  return firstInvalid === undefined
}

/**
 * Returns accessible copy for invalid email states.
 * The browser remains the source of truth for email syntax.
 *
 * @param {HTMLInputElement} input
 * @returns {string}
 */
export function emailValidationMessage(input) {
  if (input.validity.valueMissing) {
    return 'Enter an email address.'
  }

  if (input.validity.typeMismatch) {
    return 'Enter a valid email address.'
  }

  return ''
}

/**
 * @param {HTMLInputElement} input
 * @param {string} message
 */
function showError(input, message) {
  const error = errorFor(input)

  if (message === '') {
    input.removeAttribute('aria-invalid')
    error.hidden = true
    error.textContent = ''
    return
  }

  input.setAttribute('aria-invalid', 'true')
  error.textContent = message
  error.hidden = false
}

/** @param {HTMLInputElement} input */
function errorFor(input) {
  const id = input.getAttribute('aria-describedby')?.trim().split(/\s+/)[0]
  const error = id === undefined
    ? null
    : input.ownerDocument.getElementById(id)

  if (!(error instanceof HTMLElement)) {
    throw new TypeError(
      'Email validation requires an error element named by aria-describedby',
    )
  }

  return error
}
