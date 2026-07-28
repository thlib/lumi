import {on} from '../../../../dist/lumi.js'
import {emailValidationMessage} from '../validation'

import type {Binding} from '../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const validationBehaviors: ReadonlyArray<Binding<Presentation>> = [
  on<string, 'input', Presentation>(
    '[data-validate="email"]',
    'input',
    (event, element) => {
      if (
        element instanceof HTMLInputElement
        && element.hasAttribute('aria-invalid')
      ) {
        showEmailError(element, emailValidationMessage(element))
      }
    },
  ),
  on<string, 'submit', Presentation>(
    '[data-validate="submit"]',
    'submit',
    (event, element) => {
      if (!validateForm(element)) {
        event.preventDefault()
      }
    },
  ),
]

function validateForm(form: Element): boolean {
  const inputs = Array.from(
    form.querySelectorAll('[data-validate="email"]'),
  )
  let valid = true

  for (const input of inputs) {
    if (!(input instanceof HTMLInputElement)) {
      throw new TypeError('Email validation requires an input element')
    }

    input.value = input.value.trim()
    const message = emailValidationMessage(input)
    showEmailError(input, message)

    if (message !== '') {
      input.focus()
      valid = false
    }
  }

  return valid
}

function showEmailError(
  input: HTMLInputElement,
  message: string,
): void {
  const error = input.form?.querySelector('.field .error')

  if (!(error instanceof HTMLElement)) {
    throw new TypeError('Email validation requires an error message')
  }

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
