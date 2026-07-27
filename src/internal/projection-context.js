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
  return {
    data: parent.data,
    item,
    index,
    path: [...parent.path, index],
    parent,
  }
}
