// @ts-check

/**
 * Returns whether a property replaces an element or its complete contents.
 *
 * @param {string | undefined} name
 */
export function isStructuralProperty(name) {
  return name === 'innerHTML'
    || name === 'outerHTML'
    || name === 'textContent'
    || name === 'innerText'
}

/**
 * Returns whether a DOM binding replaces an element's complete contents.
 *
 * @param {{kind: string, name?: string}} descriptor
 */
export function isStructuralBinding(descriptor) {
  return descriptor.kind === 'text'
    || (
      descriptor.kind === 'property'
      && isStructuralProperty(descriptor.name)
    )
}
