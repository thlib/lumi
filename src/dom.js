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
  const element = root.matches(selector) ? root : root.querySelector(selector)

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
 * descendants. An empty result is valid.
 *
 * The search stops at each shadow boundary, as a native selector does. The
 * contents of a shadow root belong to the element that attached it.
 *
 * @param {Element} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryElements(root, selector) {
  /** @type {Element[]} */
  const elements = root.matches(selector) ? [root] : []

  elements.push(...root.querySelectorAll(selector))
  return elements
}

/**
 * Resolves a selector without crossing child component boundaries.
 * The owning container itself remains available because it belongs to the
 * component that declared the child.
 *
 * @param {Element} root
 * @param {string} selector
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
export function queryOwnedElements(root, selector, ownedSubtrees) {
  const elements = queryElements(root, selector)

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
    return owned !== element && owned.contains(element)
  })
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
 * Returns an element's depth in a component tree.
 *
 * @param {Element} root
 * @param {Element} element
 */
function elementDepth(root, element) {
  let depth = 0

  for (let current = element; current !== root; depth += 1) {
    current = current.parentElement ?? lostTarget()
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
 * Returns the child element index of each step from an ancestor to a
 * descendant.
 *
 * @param {Element} ancestor
 * @param {Element} descendant
 * @returns {number[]}
 */
export function elementPath(ancestor, descendant) {
  /** @type {number[]} */
  const path = []

  for (let current = descendant; current !== ancestor;) {
    const parent = current.parentElement ?? lostTarget()

    path.unshift(Array.prototype.indexOf.call(parent.children, current))
    current = parent
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
    current = current.children[step] ?? lostTarget()
  }

  return current
}

/**
 * The steps from one element to a set of its descendants. The paths that
 * start with the same steps share one node, so one walk finds all targets.
 *
 * @typedef {object} Locator
 * @property {number[]} slots The result positions that receive the element
 * of this node.
 * @property {number[]} steps The elementPath() steps to the child nodes, in
 * tree order.
 * @property {Locator[]} nodes The node for each step.
 */

/**
 * Compiles paths produced by elementPath() into one locator. The element
 * for the path at index `i` goes to the result position `i`.
 *
 * @param {ReadonlyArray<ReadonlyArray<number>>} paths
 * @returns {Locator}
 */
export function createLocator(paths) {
  /** @returns {Locator} */
  const createNode = () => ({slots: [], steps: [], nodes: []})
  const root = createNode()

  paths.forEach((path, slot) => {
    let node = root

    for (const step of path) {
      const {steps, nodes} = node
      let at = steps.findIndex(other => other >= step)

      if (at < 0) {
        at = steps.length
      }

      if (steps[at] !== step) {
        steps.splice(at, 0, step)
        nodes.splice(at, 0, createNode())
      }

      node = /** @type {Locator} */ (nodes[at])
    }

    node.slots.push(slot)
  })

  return root
}

/**
 * Finds the elements of a locator below one element. The walk moves from
 * sibling to sibling, so it reads each child list one time and does not
 * create a child collection for each element.
 *
 * @param {Element} element
 * @param {Locator} locator
 * @param {Element[]} found Receives each element at its result position.
 */
export function locateElements(element, {slots, steps, nodes}, found) {
  for (let index = 0; index < slots.length; index += 1) {
    found[/** @type {number} */ (slots[index])] = element
  }

  if (steps.length === 0) {
    return
  }

  /** @type {Element | null | undefined} */
  let child = element.firstElementChild
  let position = 0

  for (let index = 0; index < steps.length; index += 1) {
    for (; position < /** @type {number} */ (steps[index]); position += 1) {
      child = child?.nextElementSibling
    }

    locateElements(
      child ?? lostTarget(),
      /** @type {Locator} */ (nodes[index]),
      found,
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
 * Rejects a value that cannot contain a mounted component. A mount target
 * is an element or a document fragment. A shadow root is a document
 * fragment.
 *
 * @param {Element | DocumentFragment | null} target
 * @returns {asserts target is Element | DocumentFragment}
 * @throws {TypeError} When the value is not an element or a fragment.
 */
export function assertMountTarget(target) {
  const type = target?.nodeType

  if (type !== 1 && type !== 11) {
    throw new TypeError(
      'Lumi mount target must be a DOM element or a document fragment',
    )
  }
}
