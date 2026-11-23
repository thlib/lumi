// @ts-check

/**
 * A check for tests. It is not a part of the Lumi bundle.
 *
 * A selector that matches no element is a no-op in Lumi, so a selector with
 * a typing mistake gives no error. Each selector resolves one time, in the
 * component source, so a test can find such a selector without data.
 */

import {queryElements, sourceRoot} from './dom.js'
import {getEventBindingDescriptor} from './events.js'
import {definitions} from './internal/definitions.js'
import {
  flattenDomBindingDescriptors,
  getDomBindingDescriptor,
} from './plan.js'

/**
 * The public function for each internal binding kind that has a different
 * name.
 *
 * @type {Record<string, string>}
 */
const functionNames = {
  property: 'prop',
  attribute: 'attr',
  class: 'classToggle',
}

/**
 * @typedef {object} Declaration
 * @property {string} kind
 * @property {string} selector
 * @property {Declaration} [scope] The repeat that has this declaration in
 * its binding list.
 */

/**
 * Lists the bindings of a component whose selector matches no element in
 * the component source, in the order of their declaration.
 *
 * The result of each selector is the result that a mount gets: a binding in
 * the list of a `repeat` matches only in the element of that repeat, and no
 * binding matches in the container of a child component.
 *
 * A markup binding (`innerHTML` or `outerHTML`) can create an element in an
 * update. A selector for such an element is in the list, because the source
 * does not have the element.
 *
 * @param {object} component A component from `component()`, or its options.
 * @returns {Array<{binding: string, selector: string}>}
 * @throws {DOMException} A selector is not valid.
 */
export function unmatchedSelectors(component) {
  const options = /** @type {import('./types.js').ComponentOptions<any>} */ (
    definitions.get(component) ?? component
  )
  const source = sourceRoot(options.source)
  // An inert copy cannot invoke custom-element constructors.
  const root = /** @type {Element} */ (
    source.ownerDocument.implementation.createHTMLDocument()
      .importNode(source, true)
  )
  /** @type {Declaration[]} */
  const declarations = []

  for (const binding of options.bindings ?? []) {
    const event = getEventBindingDescriptor(binding)
    const descriptor = getDomBindingDescriptor(binding)

    if (event !== null) {
      declarations.push({kind: 'on', selector: event.selector})
    } else if (descriptor !== null) {
      declarations.push(...flattenDomBindingDescriptors([descriptor]))
    }
  }

  /**
   * @param {Declaration} declaration
   * @returns {Element[]}
   */
  const matches = declaration => {
    return declaration.scope === undefined
      ? queryElements(root, declaration.selector)
      : [...new Set(matches(declaration.scope).flatMap(element => {
        return queryElements(element, declaration.selector)
      }))]
  }

  // The child component replaces the content of its container, so no
  // selector of this component matches in a container.
  const containers = declarations
    .filter(declaration => declaration.kind === 'child')
    .flatMap(matches)

  for (const container of containers) {
    if (!containers.some(other => {
      return other !== container && other.contains(container)
    })) {
      container.replaceChildren()
    }
  }

  return declarations
    .filter(declaration => matches(declaration).length === 0)
    .map(({kind, selector}) => ({
      binding: functionNames[kind] ?? kind,
      selector,
    }))
}
