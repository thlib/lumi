// @ts-check

/**
 * Package-internal DOM primitives. The supported package surface is exported
 * only from index.js.
 *
 * @internal
 */

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
  const element = queryElements(root, selector)[0] ?? null

  if (element === null) {
    throw new Error(
      `Lumi selector "${selector}" did not match inside <${root.localName}>`,
    )
  }

  return element
}

/**
 * Returns every matching element inside a component boundary in tree order.
 * The component root participates because querySelectorAll() searches only
 * descendants. An empty result is valid for scalar bindings.
 *
 * @param {Element} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryElements(root, selector) {
  return createElementQuery(root).find(selector)
}

/**
 * Reuses one shadow-topology check while resolving several selectors against
 * the same read-only component view.
 *
 * @param {Element} root
 * @returns {{
 *   find: (selector: string) => Element[],
 *   invalidate: () => void,
 * }}
 */
export function createElementQuery(root) {
  /** @type {boolean | null} */
  let hasOpenShadowRoot = null

  return {
    find(selector) {
      hasOpenShadowRoot ??= containsOpenShadowRoot(root)
      /** @type {Element[]} */
      const elements = []
      queryElementTree(root, selector, elements, hasOpenShadowRoot)
      return elements
    },

    invalidate() {
      hasOpenShadowRoot = null
    },
  }
}

/**
 * Resolves a native selector separately in each open tree, then merges the
 * matches into shadow-including tree order. Resolving per tree preserves
 * contextual selector behavior such as :scope.
 *
 * @param {Element | ShadowRoot} scope
 * @param {string} selector
 * @param {Element[]} matches
 * @param {boolean} [hasOpenShadowRoot]
 */
function queryElementTree(scope, selector, matches, hasOpenShadowRoot) {
  const matchesInScope = scope.querySelectorAll(selector)

  if (!(hasOpenShadowRoot ?? containsOpenShadowRoot(scope))) {
    if (
      scope.nodeType === 1
      && /** @type {Element} */ (scope).matches(selector)
    ) {
      matches.push(/** @type {Element} */ (scope))
    }

    matches.push(...matchesInScope)
    return
  }

  const matchSet = new Set(matchesInScope)

  if (scope.nodeType === 1) {
    const root = /** @type {Element} */ (scope)

    if (root.matches(selector)) {
      matchSet.add(root)
    }

    visitScopedElement(root, selector, matchSet, matches)
    return
  }

  for (const child of scope.children) {
    visitScopedElement(child, selector, matchSet, matches)
  }
}

/**
 * Uses native tree traversal for the common light-DOM case. The full merge
 * walk is needed only when an open shadow root participates in tree order.
 *
 * @param {Element | ShadowRoot} scope
 */
function containsOpenShadowRoot(scope) {
  if (
    scope.nodeType === 1
    && /** @type {Element} */ (scope).shadowRoot !== null
  ) {
    return true
  }

  for (const element of scope.querySelectorAll('*')) {
    if (element.shadowRoot !== null) {
      return true
    }
  }

  return false
}

/**
 * @param {Element} element
 * @param {string} selector
 * @param {ReadonlySet<Element>} matchesInScope
 * @param {Element[]} matches
 */
function visitScopedElement(
  element,
  selector,
  matchesInScope,
  matches,
) {
  if (matchesInScope.has(element)) {
    matches.push(element)
  }

  if (element.shadowRoot !== null) {
    queryElementTree(element.shadowRoot, selector, matches)
  }

  for (const child of element.children) {
    visitScopedElement(child, selector, matchesInScope, matches)
  }
}

/**
 * Resolves a selector without crossing child component boundaries.
 * The owning container itself remains available because it belongs to the
 * component that declared the child.
 *
 * @param {Element} root
 * @param {string} selector
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {{find: (selector: string) => Element[]}} [query]
 * @returns {Element[]}
 */
export function queryOwnedElements(root, selector, ownedSubtrees, query) {
  const elements = query === undefined
    ? queryElements(root, selector)
    : query.find(selector)

  if (ownedSubtrees.length === 0) {
    return elements
  }

  return elements.filter(element => !isInsideOwnedSubtree(element, ownedSubtrees))
}

/**
 * Returns whether an element belongs to a nested component's owned DOM rather
 * than to the component that declared the child.
 *
 * @param {Element} element
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {boolean}
 */
export function isInsideOwnedSubtree(element, ownedSubtrees) {
  return ownedSubtrees.some(owned => {
    return owned !== element && shadowIncludingContains(owned, element)
  })
}

/**
 * Returns the parent element across an open ShadowRoot boundary.
 *
 * @param {Element} element
 * @returns {Element | null}
 */
export function shadowIncludingParent(element) {
  if (element.parentElement !== null) {
    return element.parentElement
  }

  const parent = element.parentNode

  return (
    parent !== null
    && parent.nodeType === 11
    && 'host' in parent
  )
    ? /** @type {ShadowRoot} */ (parent).host
    : null
}

/**
 * Returns whether an element is the same as or a shadow-including descendant
 * of another element.
 *
 * @param {Element} ancestor
 * @param {Element} descendant
 * @returns {boolean}
 */
export function shadowIncludingContains(ancestor, descendant) {
  let current = /** @type {Element | null} */ (descendant)

  while (current !== null) {
    if (current === ancestor) {
      return true
    }

    current = shadowIncludingParent(current)
  }

  return false
}

/**
 * Returns an element-only path. Negative steps enter the current element's
 * open shadow root; non-negative steps enter its light DOM.
 *
 * @param {Element} ancestor
 * @param {Element} descendant
 * @param {string} errorMessage
 * @returns {number[]}
 */
export function elementPath(ancestor, descendant, errorMessage) {
  if (ancestor === descendant) {
    return []
  }

  /** @type {number[]} */
  const path = []
  let current = descendant

  while (current !== ancestor) {
    const parent = current.parentElement

    if (parent !== null) {
      path.unshift(Array.prototype.indexOf.call(parent.children, current))
      current = parent
      continue
    }

    const shadowRoot = current.parentNode

    if (
      shadowRoot === null
      || shadowRoot.nodeType !== 11
      || !('host' in shadowRoot)
    ) {
      throw new Error(errorMessage)
    }

    const index = Array.prototype.indexOf.call(
      /** @type {ShadowRoot} */ (shadowRoot).children,
      current,
    )

    if (index < 0) {
      throw new Error(errorMessage)
    }

    path.unshift(-index - 1)
    current = /** @type {ShadowRoot} */ (shadowRoot).host
  }

  return path
}

/**
 * Resolves a path produced by elementPath().
 *
 * @param {Element} root
 * @param {ReadonlyArray<number>} path
 * @param {string} errorMessage
 * @returns {Element}
 */
export function elementAtPath(root, path, errorMessage) {
  let current = root

  for (const step of path) {
    const child = step < 0
      ? current.shadowRoot?.children[-step - 1]
      : current.children[step]

    if (child === undefined) {
      throw new Error(errorMessage)
    }
    current = child
  }

  return current
}

/**
 * Imports an element and its open shadow trees without invoking custom-element
 * constructors in the inert planning document.
 *
 * @param {Document} document
 * @param {Element} source
 * @returns {Element}
 */
export function importElementTree(document, source) {
  const imported = /** @type {Element} */ (document.importNode(source, true))
  copyOpenShadowTrees(document, source, imported)
  return imported
}

/**
 * Clones an element and its open shadow trees.
 *
 * @param {Element} source
 * @returns {Element}
 */
export function cloneElementTree(source) {
  return importElementTree(source.ownerDocument, source)
}

/**
 * @param {Document} document
 * @param {Element} source
 * @param {Element} target
 */
function copyOpenShadowTrees(document, source, target) {
  const sourceShadow = source.shadowRoot
  let targetShadow = target.shadowRoot

  if (sourceShadow !== null && targetShadow === null) {
    targetShadow = target.attachShadow({
      mode: 'open',
      delegatesFocus: sourceShadow.delegatesFocus,
    })

    for (const child of sourceShadow.childNodes) {
      targetShadow.append(document.importNode(child, true))
    }
  }

  if (sourceShadow !== null && targetShadow !== null) {
    pairChildren(
      Array.from(sourceShadow.children),
      Array.from(targetShadow.children),
      (sourceChild, targetChild) => {
        copyOpenShadowTrees(document, sourceChild, targetChild)
      },
    )
  }

  pairChildren(
    Array.from(source.children),
    Array.from(target.children),
    (sourceChild, targetChild) => {
      copyOpenShadowTrees(document, sourceChild, targetChild)
    },
  )
}

/**
 * @param {Element[]} sources
 * @param {Element[]} targets
 * @param {(source: Element, target: Element) => void} pair
 */
function pairChildren(sources, targets, pair) {
  const length = Math.min(sources.length, targets.length)

  for (let index = 0; index < length; index += 1) {
    const source = sources[index]
    const target = targets[index]

    if (source !== undefined && target !== undefined) {
      pair(source, target)
    }
  }
}

/**
 * Clones the single element that defines a component boundary.
 *
 * @param {HTMLTemplateElement | null} template
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
 * @param {Element | null} element
 * @param {string} role
 * @returns {asserts element is Element}
 * @throws {TypeError} When the value is not a DOM element.
 */
export function assertElement(element, role) {
  if (element === null || typeof element !== 'object' || element.nodeType !== 1) {
    throw new TypeError(`Lumi ${role} must be a DOM element`)
  }
}
