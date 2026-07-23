// @ts-check

/**
 * Returns the first matching element inside a component boundary.
 *
 * The component root participates in matching because querySelector() only
 * searches descendants.
 *
 * @param {Element} root
 * @param {string} selector
 * @returns {Element}
 * @throws {Error} When the selector does not match the component root or one
 * of its descendants.
 */
export function findElement(root, selector) {
  const element = root.matches(selector) ? root : root.querySelector(selector)

  if (element === null) {
    throw new Error(
      `Lumi selector "${selector}" did not match inside <${root.localName}>`,
    )
  }

  return element
}

/**
 * Clones the single element that defines a component boundary.
 *
 * @param {HTMLTemplateElement} template
 * @returns {Element}
 * @throws {TypeError} When the template does not contain exactly one root
 * element.
 */
export function cloneTemplateRoot(template) {
  if (
    template === null
    || typeof template !== 'object'
    || template.localName !== 'template'
    || !('content' in template)
  ) {
    throw new TypeError('Lumi component template must be a <template> element')
  }

  const fragment = /** @type {DocumentFragment} */ (
    template.content.cloneNode(true)
  )

  if (fragment.childElementCount !== 1) {
    throw new TypeError(
      'Lumi component template must contain exactly one root element',
    )
  }

  return /** @type {Element} */ (fragment.firstElementChild)
}

/**
 * Rejects values that cannot serve as a component or mount boundary.
 *
 * @param {Element} element
 * @param {string} role
 * @returns {void}
 * @throws {TypeError} When the value is not a DOM element.
 */
export function assertElement(element, role) {
  if (element === null || typeof element !== 'object' || element.nodeType !== 1) {
    throw new TypeError(`Lumi ${role} must be a DOM element`)
  }
}
