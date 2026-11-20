// @ts-check

/**
 * Creates the singleton occurrence at a mounted component boundary.
 *
 * @template Data
 * @param {Data} data
 * @returns {import('../types.js').ProjectionContext<Data, Data>}
 */
export function rootContext(data) {
  return {
    data,
    item: data,
    index: 0,
    path: [],
    parent: null,
  }
}

/**
 * One occurrence below a repeat binding. Projections seldom read `path`, so
 * a getter builds it on demand. An update then does not create one array for
 * each occurrence.
 *
 * The context remembers whether a projection read `index`. When tracked data
 * moves an item to a different position, Lumi prepares the occurrence again
 * only if a projection used the position.
 *
 * @template Item
 * @template Data
 */
class ItemContext {
  #index
  #usesIndex = false

  /**
   * @param {import('../types.js').ProjectionContext<unknown, Data>} parent
   * @param {Item} item
   * @param {number} index
   */
  constructor(parent, item, index) {
    this.data = parent.data
    this.item = item
    this.parent = parent
    this.#index = index
  }

  /** @returns {number} */
  get index() {
    this.#usesIndex = true
    return this.#index
  }

  /** @returns {ReadonlyArray<number>} */
  get path() {
    return [...this.parent.path, this.index]
  }

  /**
   * @param {ItemContext<unknown, unknown>} context
   * @returns {number}
   */
  static position(context) {
    return context.#index
  }

  /**
   * @param {ItemContext<unknown, unknown>} context
   * @returns {boolean}
   */
  static usesPosition(context) {
    return context.#usesIndex
  }

  /**
   * @param {ItemContext<unknown, unknown>} context
   * @param {number} index
   */
  static move(context, index) {
    context.#index = index
  }
}

/**
 * Creates one occurrence below a repeat binding.
 *
 * @template Data
 * @template Item
 * @param {import('../types.js').ProjectionContext<unknown, Data>} parent
 * @param {Item} item
 * @param {number} index
 * @returns {import('../types.js').ProjectionContext<Item, Data>}
 */
export function itemContext(parent, item, index) {
  return new ItemContext(parent, item, index)
}

/**
 * Returns the position of an occurrence. This read does not count as a use
 * of the position by a projection.
 *
 * @param {import('../types.js').ProjectionContext<unknown, unknown>} context
 * @returns {number}
 */
export function contextPosition(context) {
  return ItemContext.position(/** @type {ItemContext<unknown, unknown>} */ (
    /** @type {unknown} */ (context)
  ))
}

/**
 * Tells whether a projection read the position of an occurrence.
 *
 * @param {import('../types.js').ProjectionContext<unknown, unknown>} context
 * @returns {boolean}
 */
export function usesContextPosition(context) {
  return ItemContext.usesPosition(
    /** @type {ItemContext<unknown, unknown>} */ (
      /** @type {unknown} */ (context)
    ),
  )
}

/**
 * Gives an occurrence a new position. Its item and its parent stay the same.
 *
 * @param {import('../types.js').ProjectionContext<unknown, unknown>} context
 * @param {number} index
 */
export function moveContext(context, index) {
  ItemContext.move(
    /** @type {ItemContext<unknown, unknown>} */ (
      /** @type {unknown} */ (context)
    ),
    index,
  )
}
