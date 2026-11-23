// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {component, repeat, text} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/**
 * Mounts a list with one keyed `<li>` for each key. The text of the `<li>`
 * comes from `label`.
 *
 * @param {(key: unknown, index: number) => string} [label]
 */
function mountList(label = key => String(key)) {
  const {window} = new JSDOM()
  installMoveBefore(window)
  const {document} = window
  const template = document.createElement('template')
  template.innerHTML = '<ul><li></li></ul>'
  const target = document.createElement('div')
  document.body.append(target)
  const mounted = component({
    source: template,
    bindings: [
      repeat(
        'li',
        ({data}) => /** @type {unknown[]} */ (data),
        ({item}) => item,
        [text('li', ({item, index}) => label(item, index))],
      ),
    ],
  }).mount(target)

  return {
    mounted,
    /** @returns {Element[]} */
    elements: () => Array.from(mounted.root.querySelectorAll('li')),
  }
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Updates a list with each key list in turn. After each update, the
 * elements must be in key order, and an element must stay with its key
 * while consecutive lists have the key.
 *
 * @param {ReadonlyArray<ReadonlyArray<unknown>>} lists
 * @param {string} label
 */
function assertFollowsKeys(lists, label) {
  const {mounted, elements} = mountList()
  /** @type {Map<unknown, Element>} */
  let elementByKey = new Map()

  lists.forEach((keys, step) => {
    mounted.update(keys)

    const found = elements()
    const at = `${label}, step ${step}`

    assert.deepEqual(
      found.map(element => element.textContent),
      keys.map(String),
      at,
    )
    /** @type {Map<unknown, Element>} */
    const next = new Map()

    keys.forEach((key, index) => {
      const element = /** @type {Element} */ (found[index])
      const known = elementByKey.get(key)

      if (known !== undefined) {
        assert.strictEqual(element, known, `${at}, key ${String(key)}`)
      }
      next.set(key, element)
    })
    elementByKey = next
  })

  mounted.unmount()
}

test('random lists of integer keys keep each element with its key', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const random = seededRandom(seed)
    // Keys from the full 32-bit range and keys near zero.
    const pool = Array.from({length: 24}, (_, index) => {
      return index % 3 === 0
        ? (Math.floor(random() * 2 ** 32) - 2 ** 31) | 0
        : index - 8
    })
    const unique = [...new Set(pool)]
    const lists = Array.from({length: 10}, () => {
      return unique
        .map(key => ({key, order: random()}))
        .filter(() => random() < 0.7)
        .sort((left, right) => left.order - right.order)
        .map(({key}) => key)
    })

    assertFollowsKeys(lists, `seed ${seed}`)
  }
})

test('lists that mix integer keys with other keys keep each element', () => {
  const keys = [
    3, Symbol('key'), 7n, 'three', 2 ** 31, -1, 1.5, NaN, 0, true, null, 2 ** 31 - 1,
  ]

  assertFollowsKeys(
    [
      keys,
      keys.slice().reverse(),
      [0, 3, -1],
      [-1, 'three', 0, 3],
      ['three', NaN],
      [NaN, 7, 'three'],
      [7, 8, 9],
      keys,
    ],
    'mixed keys',
  )
})

test('a large keyed list is reordered, made smaller, and made larger', () => {
  const count = 6000
  const keys = Array.from({length: count}, (_, index) => index * 7 - 9000)
  const random = seededRandom(11)
  const shuffled = keys
    .map(key => ({key, order: random()}))
    .sort((left, right) => left.order - right.order)
    .map(({key}) => key)

  assertFollowsKeys(
    [
      keys,
      shuffled,
      shuffled.filter((_, index) => index % 3 !== 0),
      keys.slice().reverse(),
      [],
      keys,
    ],
    'large list',
  )
})

/**
 * @param {ReadonlyArray<unknown>} keys
 */
function texts(keys) {
  return keys.map(String)
}

test('each item with a duplicate key gets its own element', () => {
  /** @type {unknown[][]} */
  const cases = [
    [1, 2, 3, 2],
    [5, 5],
    [0, 1, -0],
    ['a', 'b', 'a', 'b'],
    [1, 'x', NaN, 4, NaN],
    [7, 8, 9, 'k', 8],
    [...Array.from({length: 6000}, (_, index) => index), 4321],
  ]

  for (const keys of cases) {
    const {mounted, elements} = mountList()

    mounted.update([8, 9])
    const before = elements()

    mounted.update(keys)
    assert.deepEqual(elements().map(element => element.textContent), texts(keys))
    assert.equal(mounted.root.children.length, keys.length)

    // The same keys again change no element.
    const withDuplicates = elements()
    mounted.update(keys.slice())
    assert.deepEqual(elements(), withDuplicates)

    // Unique keys after duplicate keys leave no element behind.
    mounted.update([9, 8])
    assert.deepEqual(elements().map(element => element.textContent), ['9', '8'])
    assert.equal(mounted.root.children.length, 2)

    if (keys.includes(8) && keys.includes(9)) {
      assert.deepEqual(elements(), [before[1], before[0]])
    }
    mounted.unmount()
  }
})

test('an element stays with one of the items that have its key', () => {
  for (const [first, second] of [[1, 2], ['a', 'b']]) {
    const {mounted, elements} = mountList()

    mounted.update([first, second])
    const [one, two] = elements()

    // The first item with the key keeps the element. The second item with
    // the key gets a new element.
    mounted.update([second, first, first])
    const next = elements()

    assert.strictEqual(next[0], two)
    assert.strictEqual(next[1], one)
    assert.notStrictEqual(next[2], one)
    assert.equal(next.length, 3)
    mounted.unmount()
  }
})

test('random lists with duplicate keys render one element for each item', () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    const random = seededRandom(seed)
    // Odd seeds use integer keys. Even seeds use string keys.
    const pool = Array.from({length: 6}, (_, index) => {
      return seed % 2 === 1 ? index - 2 : `k${index}`
    })
    const {mounted, elements} = mountList()

    for (let step = 0; step < 12; step += 1) {
      const keys = Array.from(
        {length: Math.floor(random() * 10)},
        () => pool[Math.floor(random() * pool.length)],
      )

      mounted.update(keys)

      const at = `seed ${seed}, step ${step}`

      assert.deepEqual(
        elements().map(element => element.textContent),
        texts(keys),
        at,
      )
      assert.equal(mounted.root.children.length, keys.length, at)
    }
    mounted.unmount()
  }
})

test('a projection error with duplicate keys changes no element', () => {
  for (const keys of [[1, 2, 1, 4], ['a', 'b', 'a', 'd']]) {
    const {mounted, elements} = mountList((key, index) => {
      if (index === 3) {
        throw new Error('projection failed')
      }
      return String(key)
    })

    mounted.update(keys.slice(0, 2))
    const before = elements()

    assert.throws(() => mounted.update(keys), /^Error: projection failed$/)
    assert.deepEqual(elements(), before)
    mounted.unmount()
  }
})
