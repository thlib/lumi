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
 * @template Item
 * @template Data
 */
class ItemContext {
  /**
   * @param {import('../types.js').ProjectionContext<unknown, Data>} parent
   * @param {Item} item
   * @param {number} index
   */
  constructor(parent, item, index) {
    this.data = parent.data
    this.item = item
    this.index = index
    this.parent = parent
  }

  /** @returns {ReadonlyArray<number>} */
  get path() {
    return [...this.parent.path, this.index]
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
