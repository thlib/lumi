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
 *   openShadowRoots: () => ReadonlySet<ShadowRoot>,
 *   recheck: (element: Element) => void,
 * }}
 */
export function createElementQuery(root) {
  /** @type {boolean | null} */
  let hasOpenShadowRoot = null
  /** @type {Set<ShadowRoot> | null} */
  let openShadowRoots = null

  return {
    find(selector) {
      hasOpenShadowRoot ??= containsOpenShadowRoot(root)

      if (!hasOpenShadowRoot) {
        openShadowRoots ??= new Set()
      }

      /** @type {Element[]} */
      const elements = []
      queryElementTree(root, selector, elements, hasOpenShadowRoot)
      return elements
    },

    invalidate() {
      hasOpenShadowRoot = null
      openShadowRoots = null
    },

    openShadowRoots() {
      if (openShadowRoots === null) {
        openShadowRoots = collectOpenShadowRoots(root)
        hasOpenShadowRoot = openShadowRoots.size > 0
      }

      return openShadowRoots
    },

    // A write reaches the element it targets, so only that subtree can gain
    // a shadow host during a commit. Rechecking it is cheaper than discarding
    // a component-wide result that a single write cannot invalidate.
    recheck(element) {
      if (hasOpenShadowRoot !== false) {
        openShadowRoots = null
        return
      }

      hasOpenShadowRoot = containsOpenShadowRoot(element)

      if (hasOpenShadowRoot) {
        openShadowRoots = null
      }
    },
  }
}

/**
 * Collects every reachable open shadow root below one component view.
 *
 * @param {Element | ShadowRoot} scope
 * @returns {Set<ShadowRoot>}
 */
export function collectOpenShadowRoots(scope) {
  /** @type {Set<ShadowRoot>} */
  const roots = new Set()

  if (scope.nodeType === 1) {
    collectOpenShadowRoot(/** @type {Element} */ (scope), roots)
  }

  const walker = elementWalker(scope)

  while (walker.nextNode() !== null) {
    collectOpenShadowRoot(
      /** @type {Element} */ (walker.currentNode),
      roots,
    )
  }

  return roots
}

/**
 * @param {Element} element
 * @param {Set<ShadowRoot>} roots
 */
function collectOpenShadowRoot(element, roots) {
  const shadowRoot = element.shadowRoot

  if (shadowRoot === null) {
    return
  }

  roots.add(shadowRoot)

  for (const nested of collectOpenShadowRoots(shadowRoot)) {
    roots.add(nested)
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
  if (scope.nodeType === 1) {
    const element = /** @type {Element} */ (scope)

    if (element.shadowRoot !== null) {
      return true
    }

    if (element.childElementCount === 0) {
      return false
    }
  }

  // Walking avoids materializing a node list for a check that usually stops
  // at the first host, or finds none at all.
  const walker = elementWalker(scope)

  while (walker.nextNode() !== null) {
    if (/** @type {Element} */ (walker.currentNode).shadowRoot !== null) {
      return true
    }
  }

  return false
}

/**
 * Walks the element descendants of one tree, excluding the scope itself.
 *
 * @param {Element | ShadowRoot | DocumentFragment} scope
 * @returns {TreeWalker}
 */
export function elementWalker(scope) {
  return scope.ownerDocument.createTreeWalker(scope, 1 /* SHOW_ELEMENT */)
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
 * Reports a DOM target that is not at its expected position. This occurs
 * only when other code changes the DOM that Lumi owns.
 *
 * @returns {never}
 */
function lostTarget() {
  throw new Error('Lumi lost a DOM target')
}

/**
 * Returns an element's depth in a shadow-including component tree.
 *
 * @param {Element} root
 * @param {Element} element
 */
function elementDepth(root, element) {
  let depth = 0

  for (let current = element; current !== root; depth += 1) {
    current = shadowIncludingParent(current) ?? lostTarget()
  }

  return depth
}

/**
 * Lists the selector matches that pass `isTask`, sorted by depth. Matches
 * with the same depth keep the declaration order, then the match order.
 *
 * @template {object} Runtime
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {(runtime: Runtime) => ReadonlyArray<Element>} matchesOf
 * @param {(runtime: Runtime, element: Element) => boolean} isTask
 * @returns {Array<{
 *   runtime: Runtime,
 *   element: Element,
 *   matchIndex: number,
 *   count: number,
 *   depth: number
 * }>}
 */
export function tasksByDepth(root, runtimes, matchesOf, isTask) {
  const tasks = []

  for (const runtime of runtimes) {
    const elements = matchesOf(runtime)

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = /** @type {Element} */ (elements[matchIndex])

      if (isTask(runtime, element)) {
        tasks.push({
          runtime,
          element,
          matchIndex,
          count: elements.length,
          depth: elementDepth(root, element),
        })
      }
    }
  }

  // The sort is stable.
  return tasks.sort((left, right) => left.depth - right.depth)
}

/**
 * Returns an element-only path. Negative steps enter the current element's
 * open shadow root; non-negative steps enter its light DOM.
 *
 * @param {Element} ancestor
 * @param {Element} descendant
 * @returns {number[]}
 */
export function elementPath(ancestor, descendant) {
  /** @type {number[]} */
  const path = []

  for (let current = descendant; current !== ancestor;) {
    const parent = current.parentNode ?? lostTarget()
    const index = Array.prototype.indexOf.call(parent.children, current)

    if (parent.nodeType === 1) {
      path.unshift(index)
      current = /** @type {Element} */ (parent)
    } else {
      path.unshift(-index - 1)
      current = /** @type {ShadowRoot} */ (parent).host ?? lostTarget()
    }
  }

  return path
}

/**
 * Resolves a path produced by elementPath().
 *
 * @param {Element} root
 * @param {ReadonlyArray<number>} path
 * @returns {Element}
 */
export function elementAtPath(root, path) {
  let current = root

  for (const step of path) {
    current = (
      step < 0
        ? current.shadowRoot?.children[-step - 1]
        : current.children[step]
    ) ?? lostTarget()
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

  // importNode() already copies the light DOM. Pairing the two trees is only
  // needed to reattach open shadow roots, which most components never have.
  if (containsOpenShadowRoot(source)) {
    copyOpenShadowTrees(document, source, imported)
  }

  return imported
}

/**
 * @param {Document} document
 * @param {Element} source
 * @param {Element} target
 */
function copyOpenShadowTrees(document, source, target) {
  pairElementTrees(source, target, (sourceElement, targetElement) => {
    const sourceShadow = sourceElement.shadowRoot

    if (sourceShadow !== null && targetElement.shadowRoot === null) {
      const targetShadow = targetElement.attachShadow({
        mode: 'open',
        delegatesFocus: sourceShadow.delegatesFocus,
      })

      for (const child of sourceShadow.childNodes) {
        targetShadow.append(document.importNode(child, true))
      }
    }
  })
}

/**
 * Visits two element trees side by side: first the two elements, then the
 * children of their open shadow roots, then their light DOM children. When
 * the trees differ, only the children at the same positions are visited.
 *
 * @param {Element} left
 * @param {Element} right
 * @param {(left: Element, right: Element) => void} visit
 */
export function pairElementTrees(left, right, visit) {
  visit(left, right)

  if (left.shadowRoot !== null && right.shadowRoot !== null) {
    pairChildren(left.shadowRoot.children, right.shadowRoot.children, visit)
  }

  pairChildren(left.children, right.children, visit)
}

/**
 * @param {HTMLCollection} left
 * @param {HTMLCollection} right
 * @param {(left: Element, right: Element) => void} visit
 */
function pairChildren(left, right, visit) {
  const length = Math.min(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    pairElementTrees(
      /** @type {Element} */ (left[index]),
      /** @type {Element} */ (right[index]),
      visit,
    )
  }
}

/**
 * Marks the elements that a planned write created, from `node` to the
 * sibling before `end`, with their descendants. A declaration in the
 * history cannot select these elements again.
 *
 * @param {Node | null} node
 * @param {Node | null} end
 * @param {WeakMap<Element, ReadonlySet<number>>} createdBy
 * @param {ReadonlySet<number>} history
 */
export function markCreated(node, end, createdBy, history) {
  for (; node !== null && node !== end; node = node.nextSibling) {
    if (node.nodeType === 1) {
      createdBy.set(/** @type {Element} */ (node), history)
      markCreated(node.firstChild, null, createdBy, history)
    }
  }
}

/**
 * Clones the single element that defines a component boundary.
 *
 * A template contributes its inert content. A fragment contributes its
 * children. An element contributes itself. The source is never consumed or
 * inserted into the mounted document.
 *
 * @param {import('./types.js').ComponentSource | null} source
 * @returns {Element}
 * @throws {TypeError} When the source is not parsed DOM or does not provide
 * exactly one root element.
 */
export function cloneSourceRoot(source) {
  const type = source?.nodeType
  /** @type {DocumentFragment | null} */
  let content = null

  if (type === 1) {
    const el = /** @type {Element} */ (source)

    if (el.localName !== 'template' || !('content' in el)) {
      return /** @type {Element} */ (el.cloneNode(true))
    }

    content = /** @type {HTMLTemplateElement} */ (el).content
  } else if (type === 11) {
    content = /** @type {DocumentFragment} */ (source)
  }

  if (content === null) {
    throw new TypeError(
      'Lumi component source must be a <template>, DocumentFragment, or Element',
    )
  }

  if (content.childElementCount !== 1) {
    throw new TypeError(
      'Lumi component source must provide exactly one root element',
    )
  }

  return /** @type {Element} */ (
    /** @type {Element} */ (content.firstElementChild).cloneNode(true)
  )
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
