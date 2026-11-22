// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {attr, component, repeat, text} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/**
 * @returns {{document: Document, window: import('jsdom').DOMWindow}}
 */
function createDocument() {
  const {window} = new JSDOM()
  installMoveBefore(window)
  return {document: window.document, window}
}

/**
 * @param {Document} document
 * @param {string} markup
 * @returns {HTMLTemplateElement}
 */
function createTemplate(document, markup) {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template
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
 * @template Value
 * @param {ReadonlyArray<Value>} values
 * @param {() => number} random
 * @returns {Value[]}
 */
function shuffle(values, random) {
  const result = [...values]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    const value = /** @type {Value} */ (result[index])
    result[index] = /** @type {Value} */ (result[other])
    result[other] = value
  }

  return result
}

/**
 * Builds the markup of a random element tree. The element with the number
 * `n` has the class `n<n>`. The root has the number 0.
 *
 * @param {() => number} random
 * @returns {{markup: string, leaves: number[], parents: number[]}}
 */
function randomTree(random) {
  /** @type {number[]} */
  const leaves = []
  /** @type {number[]} */
  const parents = []
  let count = 0

  /**
   * @param {number} depth
   * @returns {string}
   */
  const build = depth => {
    const number = count
    count += 1
    // The root has a child, so that the tree has a leaf below the root.
    const children = depth === 3
      ? 0
      : Math.floor(random() * 4) + (depth === 0 ? 1 : 0)
    let inner = ''

    for (let child = 0; child < children; child += 1) {
      inner += build(depth + 1)
    }

    ;(children === 0 ? leaves : parents).push(number)
    return `<div class="n${number}">${inner}</div>`
  }

  return {markup: build(0), leaves, parents}
}

/**
 * @typedef {{id: number, cells: string[]}} Row
 */

/**
 * @param {() => number} random
 * @param {ReadonlyArray<number>} pool
 * @returns {Row[]}
 */
function randomRows(random, pool) {
  return shuffle(pool, random)
    .slice(0, Math.floor(random() * (pool.length + 1)))
    .map(id => {
      return {
        id,
        cells: Array.from(
          {length: Math.floor(random() * 4)},
          (_, cell) => `${id}.${cell}.${Math.floor(random() * 3)}`,
        ),
      }
    })
}

test('each target of a random repeated tree gets its value', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const random = seededRandom(seed)
    const {document} = createDocument()
    const tree = randomTree(random)
    const leaves = shuffle(tree.leaves, random)
    // Leaves that are nested repeats, leaves with text, and all other
    // elements with an attribute.
    const nestedTargets = leaves.slice(0, Math.floor(random() * 3))
    const textTargets = leaves.slice(
      nestedTargets.length,
      nestedTargets.length + Math.floor(random() * 4),
    )
    const attributeTargets = shuffle([...tree.parents, ...textTargets], random)
      .filter(() => random() < 0.7)

    /** @type {Array<import('../src/types.js').Binding<any>>} */
    const rowBindings = shuffle([
      ...attributeTargets.map(number => {
        return attr(`.n${number}`, 'data-v', ({item}) => {
          return `${/** @type {Row} */ (item).id}:${number}`
        })
      }),
      ...textTargets.map(number => {
        return text(`.n${number}`, ({item}) => {
          return `${/** @type {Row} */ (item).id}/${number}`
        })
      }),
      ...nestedTargets.map(number => {
        return repeat(
          `.n${number}`,
          ({item}) => /** @type {Row} */ (item).cells,
          ({item}) => item,
          [
            text(`.n${number}`, ({item}) => /** @type {string} */ (item)),
            attr(`.n${number}`, 'data-c', ({index}) => index),
          ],
        )
      }),
    ], random)

    const target = document.createElement('div')
    document.body.append(target)
    const mounted = component({
      source: createTemplate(document, `<section>${tree.markup}</section>`),
      bindings: [
        repeat(
          '.n0',
          ({data}) => /** @type {Row[]} */ (data),
          ({item}) => /** @type {Row} */ (item).id,
          rowBindings,
        ),
      ],
    }).mount(target)
    const pool = Array.from({length: 6}, (_, id) => id)
    /** @type {Map<number, Element>} */
    let elementById = new Map()

    for (let step = 0; step < 8; step += 1) {
      const rows = randomRows(random, pool)
      mounted.update(rows)

      const elements = Array.from(mounted.root.querySelectorAll(':scope > .n0'))
      const label = `seed ${seed}, step ${step}`
      assert.equal(elements.length, rows.length, label)
      /** @type {Map<number, Element>} */
      const nextElementById = new Map()

      rows.forEach((row, position) => {
        const element = /** @type {Element} */ (elements[position])
        const known = elementById.get(row.id)

        if (known !== undefined) {
          assert.strictEqual(element, known, `${label}, row ${row.id}`)
        }
        nextElementById.set(row.id, element)

        /** @param {number} number */
        const find = number => {
          return number === 0
            ? [element]
            : Array.from(element.querySelectorAll(`.n${number}`))
        }

        for (const number of [...tree.parents, ...tree.leaves]) {
          const found = find(number)
          const isNested = nestedTargets.includes(number)
          const at = `${label}, row ${row.id}, element ${number}`

          if (isNested) {
            assert.deepEqual(
              found.map(cell => cell.textContent),
              row.cells,
              at,
            )
            assert.deepEqual(
              found.map(cell => cell.getAttribute('data-c')),
              row.cells.map((_, index) => String(index)),
              at,
            )
            continue
          }

          assert.equal(found.length, 1, at)
          assert.equal(
            found[0]?.getAttribute('data-v'),
            attributeTargets.includes(number) ? `${row.id}:${number}` : null,
            at,
          )

          if (textTargets.includes(number)) {
            assert.equal(found[0]?.textContent, `${row.id}/${number}`, at)
          }
        }
      })

      elementById = nextElementById
    }

    mounted.unmount()
  }
})

test('a repeated element gets its targets in light DOM and shadow DOM', () => {
  const {document, window} = createDocument()

  class ShadowCard extends window.HTMLElement {
    constructor() {
      super()
      const shadow = this.attachShadow({mode: 'open'})
      shadow.innerHTML = '<b class="first"></b><p><i class="second"></i></p>'
    }
  }

  window.customElements.define('shadow-card', ShadowCard)
  const target = document.createElement('div')
  document.body.append(target)
  const mounted = component({
    source: createTemplate(document, `
      <ul>
        <li class="row">
          <shadow-card><span class="light"></span></shadow-card>
          <em class="after"></em>
        </li>
      </ul>
    `),
    bindings: [
      repeat(
        '.row',
        ({data}) => /** @type {string[]} */ (data),
        ({item}) => item,
        [
          text('.second', ({item}) => `${item} second`),
          text('.after', ({item}) => `${item} after`),
          text('.light', ({item}) => `${item} light`),
          attr('shadow-card', 'data-key', ({item}) => /** @type {string} */ (item)),
          text('.first', ({item}) => `${item} first`),
        ],
      ),
    ],
  }).mount(target)

  /** @param {ReadonlyArray<string>} keys */
  const assertRows = keys => {
    const rows = Array.from(mounted.root.querySelectorAll('.row'))

    assert.deepEqual(
      rows.map(row => {
        const card = row.querySelector('shadow-card')
        const shadow = card?.shadowRoot

        return [
          card?.getAttribute('data-key'),
          shadow?.querySelector('.first')?.textContent,
          shadow?.querySelector('.second')?.textContent,
          row.querySelector('.light')?.textContent,
          row.querySelector('.after')?.textContent,
        ]
      }),
      keys.map(key => {
        return [
          key,
          `${key} first`,
          `${key} second`,
          `${key} light`,
          `${key} after`,
        ]
      }),
    )

    return rows
  }

  mounted.update(['a', 'b', 'c'])
  const [a, b, c] = assertRows(['a', 'b', 'c'])

  mounted.update(['c', 'd', 'a'])
  const rows = assertRows(['c', 'd', 'a'])

  assert.strictEqual(rows[0], c)
  assert.strictEqual(rows[2], a)
  assert.notStrictEqual(rows[1], b)
})
