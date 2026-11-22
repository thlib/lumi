// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {component, repeat, text} from '../src/index.js'
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
 * Mounts a keyed list whose items are their own keys.
 *
 * @param {Document} document
 * @param {ReadonlyArray<string>} keys
 */
function mountKeyedList(document, keys) {
  const target = document.createElement('div')
  document.body.append(target)
  const mounted = component({
    source: createTemplate(document, `
      <ul>
        <li class="item"><span class="name"></span><input></li>
      </ul>
    `),
    bindings: [
      repeat(
        '.item',
        ({data}) => /** @type {string[]} */ (data),
        ({item}) => item,
        [text('.name', ({item}) => item)],
      ),
    ],
  }).mount(target)

  mounted.update(keys)

  const list = mounted.root.querySelector('ul') ?? mounted.root
  return {mounted, list}
}

/**
 * @param {ParentNode} list
 * @returns {Element[]}
 */
function items(list) {
  return Array.from(list.querySelectorAll(':scope > .item'))
}

/**
 * @param {ParentNode} list
 * @returns {string[]}
 */
function order(list) {
  return items(list).map(element => {
    return element.querySelector('.name')?.textContent ?? ''
  })
}

/**
 * Applies one update and classifies every element mutation on the list.
 * A move is an insertion of an element that was in the list before the
 * update. With insertBefore, a move also records one removal, which is not
 * counted as a removal.
 *
 * @param {Document} document
 * @param {ReturnType<typeof mountKeyedList>} fixture
 * @param {ReadonlyArray<string>} keys
 */
function measure(document, {mounted, list}, keys) {
  const view = document.defaultView

  if (view === null) {
    throw new Error('Expected a window')
  }

  const before = new Set(items(list))
  const observer = new view.MutationObserver(() => {})
  observer.observe(list, {childList: true})
  mounted.update(keys)
  const records = observer.takeRecords()
  observer.disconnect()

  const after = new Set(items(list))
  let moves = 0
  let insertions = 0
  let removals = 0
  let mutations = 0

  for (const record of records) {
    mutations += record.addedNodes.length + record.removedNodes.length

    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) {
        continue
      }
      if (before.has(/** @type {Element} */ (node))) {
        moves += 1
      } else {
        insertions += 1
      }
    }

    for (const node of record.removedNodes) {
      if (node.nodeType === 1 && !after.has(/** @type {Element} */ (node))) {
        removals += 1
      }
    }
  }

  return {moves, insertions, removals, mutations}
}

/**
 * Computes the fewest moves independently of the implementation: survivors
 * minus the longest run of survivors that is already in the new relative
 * order (quadratic dynamic programming).
 *
 * @param {ReadonlyArray<string>} previous
 * @param {ReadonlyArray<string>} next
 */
function expectedMoves(previous, next) {
  const positions = next
    .map(key => previous.indexOf(key))
    .filter(position => position >= 0)
  /** @type {number[]} */
  const lengths = []
  let longest = 0

  for (let index = 0; index < positions.length; index += 1) {
    let length = 1
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (
        (positions[earlier] ?? 0) < (positions[index] ?? 0)
        && (lengths[earlier] ?? 0) + 1 > length
      ) {
        length = (lengths[earlier] ?? 0) + 1
      }
    }
    lengths.push(length)
    longest = Math.max(longest, length)
  }

  return positions.length - longest
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
 * @template T
 * @param {ReadonlyArray<T>} values
 * @param {() => number} random
 * @returns {T[]}
 */
function shuffle(values, random) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    const value = /** @type {T} */ (result[index])
    result[index] = /** @type {T} */ (result[other])
    result[other] = value
  }
  return result
}

const letters = ['A', 'B', 'C', 'D', 'E', 'F']

/**
 * @param {ReadonlyArray<string>} previous
 * @param {ReadonlyArray<string>} next
 * @param {{moves: number, insertions?: number, removals?: number}} expected
 */
function assertTransition(previous, next, expected) {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, previous)
  const elements = new Map(items(fixture.list).map((element, index) => {
    return [previous[index], element]
  }))
  const counts = measure(document, fixture, next)

  assert.deepEqual(order(fixture.list), [...next])
  assert.deepEqual(
    {
      moves: counts.moves,
      insertions: counts.insertions,
      removals: counts.removals,
    },
    {
      moves: expected.moves,
      insertions: expected.insertions ?? 0,
      removals: expected.removals ?? 0,
    },
  )

  const current = items(fixture.list)
  for (let index = 0; index < next.length; index += 1) {
    const key = next[index]
    if (elements.has(key)) {
      assert.strictEqual(current[index], elements.get(key))
    }
  }

  fixture.mounted.unmount()
  return counts
}

test('moves only the last key when it goes to the front', () => {
  assertTransition(letters, ['F', 'A', 'B', 'C', 'D', 'E'], {moves: 1})
})

test('moves only the first key when it goes to the end', () => {
  assertTransition(['F', 'A', 'B', 'C', 'D', 'E'], letters, {moves: 1})
})

test('moves only the two end keys when they swap', () => {
  assertTransition(letters, ['F', 'B', 'C', 'D', 'E', 'A'], {moves: 2})
})

test('moves n minus one keys for a full reverse', () => {
  const keys = Array.from({length: 12}, (_, index) => `k${index}`)
  assertTransition(keys, [...keys].reverse(), {moves: keys.length - 1})
})

test('moves the fewest keys for seeded random shuffles', () => {
  const random = seededRandom(0x13d1)
  const keys = Array.from({length: 40}, (_, index) => `k${index}`)

  for (let round = 0; round < 25; round += 1) {
    const previous = shuffle(keys, random)
    const next = shuffle(keys, random)
    assertTransition(previous, next, {moves: expectedMoves(previous, next)})
  }
})

test('inserts a middle key without moving existing keys', () => {
  assertTransition(letters, ['A', 'B', 'C', 'X', 'D', 'E', 'F'], {
    moves: 0,
    insertions: 1,
  })
})

test('removes a middle key without moving existing keys', () => {
  assertTransition(letters, ['A', 'B', 'D', 'E', 'F'], {
    moves: 0,
    removals: 1,
  })
})

test('inserts, removes, and reorders keys with the fewest operations', () => {
  const previous = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const next = ['H', 'X', 'B', 'A', 'D', 'Y', 'F', 'Z']
  assertTransition(previous, next, {
    moves: expectedMoves(previous, next),
    insertions: 3,
    removals: 3,
  })

  const random = seededRandom(7)
  const pool = Array.from({length: 30}, (_, index) => `k${index}`)
  for (let round = 0; round < 25; round += 1) {
    const before = shuffle(pool, random).slice(0, 20)
    const after = shuffle(pool, random).slice(0, 20)
    assertTransition(before, after, {
      moves: expectedMoves(before, after),
      insertions: after.filter(key => !before.includes(key)).length,
      removals: before.filter(key => !after.includes(key)).length,
    })
  }
})

test('does not mutate the list when the key order is unchanged', () => {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, letters)
  const initial = items(fixture.list)
  const counts = measure(document, fixture, [...letters])

  assert.equal(counts.mutations, 0)
  assert.deepEqual(items(fixture.list), initial)
})

test('reuses the template element for the first key on the first update', () => {
  const {document} = createDocument()
  const target = document.createElement('div')
  const mounted = component({
    source: createTemplate(document, '<ul><li class="item"></li></ul>'),
    bindings: [
      repeat(
        '.item',
        ({data}) => /** @type {string[]} */ (data),
        ({item}) => item,
        [text(':scope', ({item}) => item)],
      ),
    ],
  }).mount(target)
  const list = mounted.root.querySelector('ul') ?? mounted.root
  const pristine = list.querySelector('.item')
  assert.notEqual(pristine, null)

  const fixture = {mounted, list}
  const counts = measure(document, fixture, ['A', 'B', 'C'])

  assert.deepEqual(
    Array.from(list.querySelectorAll('.item'), item => item.textContent),
    ['A', 'B', 'C'],
  )
  assert.strictEqual(list.querySelector('.item'), pristine)
  assert.deepEqual(
    {moves: counts.moves, insertions: counts.insertions},
    {moves: 0, insertions: 2},
  )
})

test('keeps element identity and order through many keyed updates', () => {
  const {document} = createDocument()
  const random = seededRandom(42)
  const pool = Array.from({length: 24}, (_, index) => `k${index}`)
  /** @type {string[]} */
  let current = pool.slice(0, 10)
  const fixture = mountKeyedList(document, current)
  /** @type {Map<string, Element>} */
  let byKey = new Map(items(fixture.list).map((element, index) => {
    return [current[index] ?? '', element]
  }))

  for (let round = 0; round < 60; round += 1) {
    const size = Math.floor(random() * pool.length)
    const next = shuffle(pool, random).slice(0, size)
    measure(document, fixture, next)

    const elements = items(fixture.list)
    assert.deepEqual(order(fixture.list), next)
    for (let index = 0; index < next.length; index += 1) {
      const previous = byKey.get(next[index] ?? '')
      if (previous !== undefined) {
        assert.strictEqual(elements[index], previous)
      }
    }

    current = next
    byKey = new Map(elements.map((element, index) => {
      return [current[index] ?? '', element]
    }))
  }
})

test('keeps focus on an element that stays in the ordered run', () => {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, letters)
  const input = items(fixture.list)[2]?.querySelector('input')

  if (input === null || input === undefined) {
    throw new Error('Expected an input')
  }

  input.focus()
  assert.strictEqual(document.activeElement, input)
  measure(document, fixture, ['F', 'A', 'B', 'C', 'D', 'E'])
  assert.strictEqual(document.activeElement, input)
})

test('moves existing keys with moveBefore and inserts new keys', () => {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, letters)
  const prototype = Object.getPrototypeOf(fixture.list)
  /** @type {Node[]} */
  const moved = []
  /** @type {Node[]} */
  const inserted = []
  const insertBefore = fixture.list.insertBefore

  Object.defineProperty(prototype, 'moveBefore', {
    configurable: true,
    writable: true,
    /**
     * @param {Node} node
     * @param {Node | null} reference
     */
    value(node, reference) {
      moved.push(node)
      insertBefore.call(this, node, reference)
    },
  })
  Object.defineProperty(fixture.list, 'insertBefore', {
    configurable: true,
    writable: true,
    /**
     * @param {Node} node
     * @param {Node | null} reference
     */
    value(node, reference) {
      inserted.push(node)
      return insertBefore.call(this, node, reference)
    },
  })

  try {
    const [a, , , , , f] = items(fixture.list)
    const counts = measure(document, fixture, ['F', 'X', 'A', 'B', 'C', 'D'])

    assert.deepEqual(order(fixture.list), ['F', 'X', 'A', 'B', 'C', 'D'])
    assert.deepEqual(moved, [f])
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0]?.parentNode, fixture.list)
    assert.strictEqual(items(fixture.list)[2], a)
    assert.deepEqual(
      {
        moves: counts.moves,
        insertions: counts.insertions,
        removals: counts.removals,
      },
      {moves: 1, insertions: 1, removals: 1},
    )
  } finally {
    Reflect.deleteProperty(prototype, 'moveBefore')
  }
})

test('the moveBefore shim moves an element with insertBefore', () => {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, letters)
  /** @type {Node[]} */
  const inserted = []
  const insertBefore = fixture.list.insertBefore

  Object.defineProperty(fixture.list, 'insertBefore', {
    configurable: true,
    writable: true,
    /**
     * @param {Node} node
     * @param {Node | null} reference
     */
    value(node, reference) {
      inserted.push(node)
      return insertBefore.call(this, node, reference)
    },
  })

  const f = items(fixture.list)[5]
  measure(document, fixture, ['F', 'A', 'B', 'C', 'D', 'E'])
  assert.deepEqual(inserted, [f])
  assert.deepEqual(order(fixture.list), ['F', 'A', 'B', 'C', 'D', 'E'])
})

test('the moveBefore shim keeps a moveBefore that the window has', () => {
  const {window} = new JSDOM()
  const native = () => {}
  Reflect.set(window.Element.prototype, 'moveBefore', native)

  installMoveBefore(window)

  assert.strictEqual(Reflect.get(window.Element.prototype, 'moveBefore'), native)
  assert.equal(
    typeof Reflect.get(window.DocumentFragment.prototype, 'moveBefore'),
    'function',
  )
})

test('reorders nested keyed repeats and keeps their elements', () => {
  const {document} = createDocument()
  /**
   * @typedef {{id: string, people: string[]}} Group
   */
  const mounted = component({
    source: createTemplate(document, `
      <section>
        <div class="group"><h2></h2><ul><li class="person"></li></ul></div>
      </section>
    `),
    bindings: [
      repeat(
        '.group',
        ({data}) => /** @type {Group[]} */ (data),
        ({item}) => item.id,
        [
          text('h2', ({item}) => item.id),
          repeat(
            '.person',
            ({item}) => /** @type {Group} */ (item).people,
            ({item}) => item,
            [text(':scope', ({item}) => item)],
          ),
        ],
      ),
    ],
  }).mount(document.createElement('div'))

  mounted.update([
    {id: 'g1', people: ['a', 'b', 'c']},
    {id: 'g2', people: ['d', 'e']},
    {id: 'g3', people: ['f']},
  ])

  const groups = Array.from(mounted.root.querySelectorAll('.group'))
  const people = new Map(
    Array.from(mounted.root.querySelectorAll('.person'), element => {
      return [element.textContent, element]
    }),
  )

  mounted.update([
    {id: 'g3', people: ['f', 'g']},
    {id: 'g1', people: ['c', 'a', 'b']},
    {id: 'g2', people: ['e']},
  ])

  const reordered = Array.from(mounted.root.querySelectorAll('.group'))
  assert.deepEqual(reordered, [groups[2], groups[0], groups[1]])
  assert.deepEqual(
    reordered.map(group => {
      return Array.from(group.querySelectorAll('.person'), person => {
        return person.textContent
      })
    }),
    [['f', 'g'], ['c', 'a', 'b'], ['e']],
  )
  for (const key of ['a', 'b', 'c', 'e', 'f']) {
    assert.strictEqual(
      Array.from(mounted.root.querySelectorAll('.person')).find(person => {
        return person.textContent === key
      }),
      people.get(key),
    )
  }
  assert.equal(people.get('d')?.isConnected, false)
})

test('reorders keyed repeats inside positional repeats', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(document, `
      <section><ul class="group"><li class="person"></li></ul></section>
    `),
    bindings: [
      repeat('.group', ({data}) => /** @type {string[][]} */ (data), [
        repeat(
          '.person',
          ({item}) => /** @type {string[]} */ (item),
          ({item}) => item,
          [text(':scope', ({item}) => item)],
        ),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update([['a', 'b', 'c'], ['d', 'e']])
  const before = Array.from(mounted.root.querySelectorAll('.person'))
  mounted.update([['c', 'a', 'b'], ['e', 'd'], ['x']])

  const groups = Array.from(mounted.root.querySelectorAll('.group'))
  assert.deepEqual(
    groups.map(group => {
      return Array.from(group.querySelectorAll('.person'), person => {
        return person.textContent
      })
    }),
    [['c', 'a', 'b'], ['e', 'd'], ['x']],
  )
  const after = Array.from(mounted.root.querySelectorAll('.person'))
  assert.deepEqual(after.slice(0, 5), [
    before[2],
    before[0],
    before[1],
    before[4],
    before[3],
  ])
})

test('restores the projected order after outside code swaps elements', () => {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, ['A', 'B', 'C', 'D'])
  const [a, b, c, d] = items(fixture.list)

  // Code outside Lumi, for example a drag-and-drop library, swaps A and B.
  fixture.list.insertBefore(/** @type {Element} */ (b), a ?? null)
  assert.deepEqual(order(fixture.list), ['B', 'A', 'C', 'D'])

  fixture.mounted.update(['A', 'B', 'C', 'D'])
  assert.deepEqual(order(fixture.list), ['A', 'B', 'C', 'D'])
  assert.deepEqual(items(fixture.list), [a, b, c, d])
})

test('reorders correctly after outside code swaps elements', () => {
  const {document} = createDocument()
  const fixture = mountKeyedList(document, ['A', 'B', 'C', 'D'])
  const [a, b, c, d] = items(fixture.list)

  fixture.list.insertBefore(/** @type {Element} */ (b), a ?? null)
  fixture.mounted.update(['A', 'B', 'D', 'C'])
  assert.deepEqual(order(fixture.list), ['A', 'B', 'D', 'C'])
  assert.deepEqual(items(fixture.list), [a, b, d, c])

  fixture.list.insertBefore(/** @type {Element} */ (c), a ?? null)
  fixture.mounted.update(['D', 'A', 'X', 'B', 'C'])
  assert.deepEqual(order(fixture.list), ['D', 'A', 'X', 'B', 'C'])
  const current = items(fixture.list)
  assert.deepEqual(
    [current[0], current[1], current[3], current[4]],
    [d, a, b, c],
  )
})

test('restores an element that outside code moved among other siblings', () => {
  const {document} = createDocument()
  const target = document.createElement('div')
  const mounted = component({
    source: createTemplate(document, `<ul
      ><li class="head"></li
      ><li class="item"><span class="name"></span></li
      ><li class="tail"></li
    ></ul>`),
    bindings: [
      repeat(
        '.item',
        ({data}) => /** @type {string[]} */ (data),
        ({item}) => item,
        [text('.name', ({item}) => item)],
      ),
    ],
  }).mount(target)
  mounted.update(['A', 'B', 'C', 'D'])
  const list = mounted.root.querySelector('ul') ?? mounted.root
  const head = list.querySelector('.head')
  const tail = list.querySelector('.tail')
  const [a, b, c, d] = items(list)
  const other = document.createElement('div')

  /** @returns {string[]} */
  function children() {
    return Array.from(list.children, element => {
      return element.classList.contains('item')
        ? element.querySelector('.name')?.textContent ?? ''
        : element.className
    })
  }

  // Outside code moves B after the tail sibling and C out of the list.
  list.append(/** @type {Element} */ (b))
  other.append(/** @type {Element} */ (c))
  mounted.update(['A', 'B', 'C', 'D'])
  assert.deepEqual(children(), ['head', 'A', 'B', 'C', 'D', 'tail'])
  assert.deepEqual(items(list), [a, b, c, d])

  // Outside code moves D before the head sibling, then the data reorders.
  list.prepend(/** @type {Element} */ (d))
  mounted.update(['D', 'C', 'B', 'A'])
  assert.deepEqual(children(), ['head', 'D', 'C', 'B', 'A', 'tail'])
  assert.strictEqual(list.firstElementChild, head)
  assert.strictEqual(list.lastElementChild, tail)
})

test('restores the projected order after random outside reorders', () => {
  const {document} = createDocument()
  const random = seededRandom(99)
  const pool = Array.from({length: 16}, (_, index) => `k${index}`)
  const fixture = mountKeyedList(document, pool.slice(0, 10))

  for (let round = 0; round < 60; round += 1) {
    const elements = items(fixture.list)
    for (const element of shuffle(elements, random).slice(0, 3)) {
      const other = elements[Math.floor(random() * elements.length)] ?? null
      fixture.list.insertBefore(element, other)
    }

    const next = shuffle(pool, random).slice(0, 4 + Math.floor(random() * 12))
    fixture.mounted.update(next)
    assert.deepEqual(order(fixture.list), next)
  }
})
