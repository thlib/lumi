// @ts-check

/**
 * Delegates one native event to descendants matching a selector.
 *
 * @param {Element | null} root
 * @param {string} type
 * @param {string} selector
 * @param {(event: Event, element: Element) => void} handle
 * @param {boolean | AddEventListenerOptions} [options]
 * @returns {() => void}
 */
export function on(root, type, selector, handle, options = false) {
  if (!(root instanceof Element)) {
    throw new TypeError('Event root must be an element')
  }

  /** @param {Event} event */
  const listener = event => {
    if (!(event.target instanceof Element)) {
      return
    }

    const element = event.target.closest(selector)

    if (element !== null && root.contains(element)) {
      handle(event, element)
    }
  }

  root.addEventListener(type, listener, options)

  return () => root.removeEventListener(type, listener, options)
}
