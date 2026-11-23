// @ts-check

/**
 * The sentence for each error code. Only the development version has these
 * texts. Codes 1 to 19 are in the two versions. Codes 20 and higher are
 * checks of the development version only. For each of these, the production
 * version gives the error of the browser.
 *
 * Each sentence starts with the declaration that has the problem, then
 * states the problem, then gives the correction when one is known.
 *
 * @internal
 * @type {Record<number, (...details: any[]) => string>}
 */
export const messages = {
  1: (kind, name) =>
    `${kind} binding "${name}" is an event handler. Use on().`,
  2: (kind, name) =>
    `${kind} binding "${name}" is not permitted. It makes a document from text.`,
  3: name =>
    `property "${name}" must get TrustedHTML, but the document has no Trusted Types API.`,
  4: name =>
    `property "${name}" must get TrustedHTML. The projection gave a different value.`,
  5: selector =>
    `repeat "${selector}" matches the component root. A repeat must match a descendant.`,
  6: selector =>
    `repeat "${selector}" contains the container of a child component.`,
  7: selector =>
    `binding "${selector}" in the list of a repeat matches an element outside that repeat.`,
  8: selector =>
    `binding "${selector}" in the list of a repeat matches an element in a different repeat.`,
  9: selector =>
    `content binding "${selector}" contains the container of a child component.`,
  10: selector =>
    `outerHTML binding "${selector}" matches the component root.`,
  11: selector =>
    `content binding "${selector}" contains the element of a repeat.`,
  12: selector =>
    `outerHTML binding "${selector}" matches an element that markup created. The element must be in the component source.`,
  13: () =>
    'the component is in an update. An update or an unmount cannot start before the update is complete.',

  20: () =>
    'the mount target must be an element or a document fragment.',
  21: () =>
    'the component source must be a <template>, a document fragment, or an element.',
  22: () =>
    'the component source must have a root element.',
  23: selector =>
    `repeat "${selector}": the list can contain only repeat, text, attr, prop, classToggle, and style bindings.`,
  24: () =>
    'child: the component must come from component().',
}
