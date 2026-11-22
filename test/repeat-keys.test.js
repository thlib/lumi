// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {component, repeat, text} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/**
 * @template Data
 * @typedef {import('../src/index.js').ComponentOptions<Data>} Options
 */

/** @typedef {{id: unknown, name: string}} Item */

/**
 * @param {string} markup
 */
function createSource(markup) {
  const {window} = new JSDOM()
  installMoveBefore(window)
  const {document} = window
  const template = document.createElement('template')
  template.innerHTML = markup
  return {document, template}
}

/**
 * Mounts a keyed list of items.
 */
function mountItems() {
  const {document, template} = createSource(
    '<ul><li class="item"><span class="name"></span></li></ul>',
  )
  /** @type {Options<Item[]>} */
  const options = {
    source: template,
    bindings: [
      repeat(
        '.item',
        ({data}) => data,
        ({item}) => /** @type {Item} */ (item).id,
        [text('.name', ({item}) => /** @type {Item} */ (item).name)],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  const names = () => {
    return Array.from(
      mounted.root.querySelectorAll('.name'),
      element => element.textContent,
    )
  }
  const elements = () => Array.from(mounted.root.querySelectorAll('.item'))

  return {mounted, names, elements}
}

/**
 * @param {ReadonlyArray<unknown>} ids
 * @returns {Item[]}
 */
function items(ids) {
  return ids.map(id => ({id, name: String(id)}))
}

test('an update with the same keys keeps every element', () => {
  const {mounted, names, elements} = mountItems()

  mounted.update(items([1, 2, 3]))
  const before = elements()
  mounted.update([
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
  ])

  assert.deepEqual(elements(), before)
  assert.deepEqual(names(), ['one', 'two', 'three'])
})

test('an update with the same keys restores an outside reorder', () => {
  const {mounted, names, elements} = mountItems()

  mounted.update(items([1, 2, 3]))
  const [first, second, third] = elements()
  assert.ok(first && second && third)
  third.after(first)

  mounted.update(items([1, 2, 3]))

  assert.deepEqual(elements(), [first, second, third])
  assert.deepEqual(names(), ['1', '2', '3'])
})

test('a duplicate key after an unchanged start is rejected', () => {
  const {mounted, names} = mountItems()

  mounted.update(items([1, 2, 3]))

  assert.throws(
    () => mounted.update(items([1, 2, 2])),
    /duplicated at item positions 2 and 3/,
  )
  assert.deepEqual(names(), ['1', '2', '3'])
})

test('a duplicate key after all accepted keys is rejected', () => {
  const {mounted, names} = mountItems()

  mounted.update(items([1, 2, 3]))

  assert.throws(
    () => mounted.update(items([1, 2, 3, 1])),
    /duplicated at item positions 1 and 4/,
  )
  assert.deepEqual(names(), ['1', '2', '3'])

  mounted.update(items([1, 2, 3, 4]))
  assert.deepEqual(names(), ['1', '2', '3', '4'])
})

test('a rejected key list does not change the accepted keys', () => {
  const {mounted, names} = mountItems()

  mounted.update(items([1, 2]))
  assert.throws(() => mounted.update(items([2, 2])), /duplicated/)
  assert.throws(() => mounted.update(items([2, 2])), /duplicated/)

  mounted.update(items([2, 1]))
  assert.deepEqual(names(), ['2', '1'])
})

test('a shorter list with the same first keys keeps those elements', () => {
  const {mounted, names, elements} = mountItems()

  mounted.update(items([1, 2, 3]))
  const before = elements()
  mounted.update(items([1, 2]))

  assert.deepEqual(elements(), before.slice(0, 2))
  assert.deepEqual(names(), ['1', '2'])

  assert.throws(
    () => mounted.update(items([1, 2, 1])),
    /duplicated at item positions 1 and 3/,
  )
})

test('NaN keys are equal to each other', () => {
  const {mounted, names, elements} = mountItems()

  mounted.update(items([NaN, 1]))
  const before = elements()
  mounted.update(items([NaN, 1]))

  assert.deepEqual(elements(), before)
  assert.deepEqual(names(), ['NaN', '1'])
  assert.throws(
    () => mounted.update(items([NaN, NaN])),
    /duplicated at item positions 1 and 2/,
  )
})

test('each nested keyed list has its own duplicate check', () => {
  const {document, template} = createSource(
    '<div><section class="group"><span class="member"></span></section></div>',
  )
  /** @type {Options<number[][]>} */
  const options = {
    source: template,
    bindings: [
      repeat('.group', ({data}) => data),
      repeat(
        '.member',
        ({item}) => /** @type {number[]} */ (/** @type {unknown} */ (item)),
        ({item}) => item,
      ),
      text('.member', ({item}) => /** @type {number} */ (item)),
    ],
  }
  const mounted = component(options).mount(document.body)
  const members = () => {
    return Array.from(
      mounted.root.querySelectorAll('.group'),
      group => Array.from(
        group.querySelectorAll('.member'),
        member => member.textContent,
      ),
    )
  }

  mounted.update([[1, 2], [1, 2]])
  assert.deepEqual(members(), [['1', '2'], ['1', '2']])

  assert.throws(
    () => mounted.update([[1, 2], [1, 1]]),
    /duplicated at item positions 1 and 2/,
  )
  assert.deepEqual(members(), [['1', '2'], ['1', '2']])

  mounted.update([[2, 1], [3]])
  assert.deepEqual(members(), [['2', '1'], ['3']])
})

test('a projection can read the positional path', () => {
  const {document, template} = createSource(
    '<div><section class="group"><span class="member"></span></section></div>',
  )
  /** @type {Options<string[][]>} */
  const options = {
    source: template,
    bindings: [
      repeat('.group', ({data}) => data),
      repeat(
        '.member',
        ({item}) => /** @type {string[]} */ (/** @type {unknown} */ (item)),
      ),
      text('.member', ({item, index, path, parent}) => {
        return `${item}:${index}:${path.join('.')}:${parent?.path.join('.')}`
      }),
    ],
  }
  const mounted = component(options).mount(document.body)

  mounted.update([['a'], ['b', 'c']])

  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.member'),
      member => member.textContent,
    ),
    ['a:0:0.0:0', 'b:0:1.0:1', 'c:1:1.1:1'],
  )
})
