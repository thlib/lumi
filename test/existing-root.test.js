// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {
  attr,
  child,
  classToggle,
  component,
  on,
  repeat,
  text,
} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/**
 * Makes a document with a component source and with server HTML in the
 * mount target.
 *
 * @param {string} source
 * @param {string} server
 */
function createPage(source, server) {
  const {window} = new JSDOM(`<main>${server}</main>`)
  installMoveBefore(window)
  const {document} = window
  const template = document.createElement('template')
  template.innerHTML = source
  const target = /** @type {Element} */ (document.querySelector('main'))
  const root = /** @type {Element} */ (target.firstElementChild)

  return {window, document, template, target, root}
}

/**
 * Records the DOM changes below a root, without the anchors of Lumi.
 *
 * @param {import('jsdom').DOMWindow} window
 * @param {Element} root
 */
function recordChanges(window, root) {
  const observer = new window.MutationObserver(() => {})

  observer.observe(root, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  })

  return () => observer.takeRecords().filter(record => {
    const nodes = [...record.addedNodes, ...record.removedNodes]

    return record.type !== 'childList'
      || nodes.some(node => node.nodeType !== 8)
  })
}

/**
 * Gives a value without its type. The tests have data of many shapes.
 *
 * @param {unknown} value
 * @returns {any}
 */
function untyped(value) {
  return value
}

/**
 * @param {Element} root
 * @param {string} selector
 */
function texts(root, selector) {
  return Array.from(root.querySelectorAll(selector), el => el.textContent)
}

const listSource = `
  <section>
    <h1>Title</h1>
    <ul><li class="item"><b class="name">Name</b></li></ul>
    <p class="total">0</p>
  </section>
`

/** @typedef {{id: string, name: string}} Item */
/** @typedef {{title: string, items: Item[]}} List */

/**
 * @param {HTMLTemplateElement} template
 * @param {boolean} keyed
 */
function listComponent(template, keyed) {
  /** @type {ReadonlyArray<import('../src/types.js').Binding<any>>} */
  const row = [
    text('.name', ({item}) => /** @type {Item} */ (item).name),
    attr(':scope', 'data-id', ({item}) => /** @type {Item} */ (item).id),
  ]

  return component({
    source: template,
    bindings: [
      text('h1', ({data}) => /** @type {List} */ (data).title),
      keyed
        ? repeat('.item', ({data}) => /** @type {List} */ (data).items, ({item}) => item.id, row)
        : repeat('.item', ({data}) => /** @type {List} */ (data).items, row),
      text('.total', ({data}) => /** @type {List} */ (data).items.length),
    ],
  })
}

const items = [
  {id: 'a', name: 'Ada'},
  {id: 'g', name: 'Grace'},
  {id: 'k', name: 'Katherine'},
]

const serverList = `<section>
    <h1>People</h1>
    <ul><li class="item" data-id="a"><b class="name">Ada</b></li><li class="item" data-id="g"><b class="name">Grace</b></li><li class="item" data-id="k"><b class="name">Katherine</b></li></ul>
    <p class="total">3</p>
  </section>`

for (const keyed of [false, true]) {
  const kind = keyed ? 'keyed' : 'positional'

  test(`mount keeps the elements of a ${kind} list and writes nothing for equal data`, () => {
    const {window, template, target, root} = createPage(listSource, serverList)
    const rows = Array.from(root.querySelectorAll('.item'))
    const total = root.querySelector('.total')
    const changes = recordChanges(window, root)
    const mounted = listComponent(template, keyed).mount(target)

    assert.strictEqual(mounted.root, root)

    mounted.update({title: 'People', items})

    assert.deepEqual(changes(), [])
    assert.deepEqual(Array.from(root.querySelectorAll('.item')), rows)

    // A later update writes to the same elements.
    mounted.update({
      title: 'Staff',
      items: [items[0], {id: 'g', name: 'Grace H.'}],
    })

    assert.equal(root.querySelector('h1')?.textContent, 'Staff')
    assert.deepEqual(texts(root, '.name'), ['Ada', 'Grace H.'])
    assert.strictEqual(root.querySelectorAll('.item')[1], rows[1])
    // The element after the list keeps its position.
    assert.strictEqual(root.querySelector('.total'), total)
    assert.equal(total?.textContent, '2')

    mounted.update({title: 'Staff', items: [...items, {id: 'm', name: 'Margaret'}]})

    assert.deepEqual(
      texts(root, '.name'),
      ['Ada', 'Grace', 'Katherine', 'Margaret'],
    )
    assert.equal(root.querySelector('ul')?.lastElementChild?.getAttribute('data-id'), 'm')
  })
}

test('the first update writes only the differences between the DOM and the data', () => {
  const {window, template, target, root} = createPage(listSource, serverList)
  const changes = recordChanges(window, root)
  const mounted = listComponent(template, false).mount(target)

  mounted.update({
    title: 'People',
    items: [items[0], {id: 'g', name: 'Grace H.'}, items[2]],
  })

  const records = changes()

  assert.equal(records.length, 1)
  assert.equal(records[0]?.type, 'characterData')
  assert.deepEqual(texts(root, '.name'), ['Ada', 'Grace H.', 'Katherine'])
})

test('a keyed list moves the elements that the target had', () => {
  const {template, target, root} = createPage(listSource, serverList)
  const [first, second, third] = Array.from(root.querySelectorAll('.item'))
  const mounted = listComponent(template, true).mount(target)

  mounted.update({title: 'People', items})
  mounted.update({title: 'People', items: [items[2], items[0], items[1]]})

  assert.deepEqual(
    Array.from(root.querySelectorAll('.item')),
    [third, first, second],
  )
})

test('mount finds the element after an empty list and after a longer list', () => {
  const emptyServer = `<section>
    <h1>People</h1>
    <ul></ul>
    <p class="total">0</p>
  </section>`
  const empty = createPage(listSource, emptyServer)
  const emptyChanges = recordChanges(empty.window, empty.root)
  const mounted = listComponent(empty.template, false).mount(empty.target)

  mounted.update({title: 'People', items: []})
  assert.deepEqual(emptyChanges(), [])

  mounted.update({title: 'People', items: items.slice(0, 2)})
  assert.deepEqual(texts(empty.root, 'ul > .item .name'), ['Ada', 'Grace'])
  assert.equal(empty.root.querySelector('.total')?.textContent, '2')

  // The list and the next element have the same parent here.
  const source = '<div><span class="tag">Tag</span><b class="after">After</b></div>'
  const server = '<div><span class="tag">x</span><span class="tag">y</span><span class="tag">z</span><b class="after">3</b></div>'
  const flat = createPage(source, server)
  const flatChanges = recordChanges(flat.window, flat.root)
  const tags = component({
    source: flat.template,
    bindings: [
      repeat('.tag', ({data}) => /** @type {string[]} */ (data), [
        text(':scope', ({item}) => item),
      ]),
      text('.after', ({data}) => /** @type {string[]} */ (data).length),
    ],
  }).mount(flat.target)

  tags.update(['x', 'y', 'z'])
  assert.deepEqual(flatChanges(), [])

  tags.update(['x'])
  assert.equal(flat.root.innerHTML.replace(/<!--lumi-->/g, ''), '<span class="tag">x</span><b class="after">1</b>')
})

test('a list with more items than elements makes the other elements', () => {
  const {template, target, root} = createPage(listSource, serverList)
  const rows = Array.from(root.querySelectorAll('.item'))
  const mounted = listComponent(template, false).mount(target)

  mounted.update({
    title: 'People',
    items: [...items, {id: 'm', name: 'Margaret'}, {id: 'h', name: 'Hedy'}],
  })

  assert.deepEqual(
    texts(root, '.name'),
    ['Ada', 'Grace', 'Katherine', 'Margaret', 'Hedy'],
  )
  assert.deepEqual(Array.from(root.querySelectorAll('.item')).slice(0, 3), rows)
  assert.equal(root.querySelector('.total')?.textContent, '5')
})

test('mount connects nested lists, a conditional region, and events', () => {
  const source = `
    <section>
      <div class="group"><h2>Group</h2><ul><li class="person">Person</li></ul></div>
      <aside id="profile"><b class="name">Name</b></aside>
      <button type="button">Save</button>
    </section>
  `
  const server = `<section>
      <div class="group"><h2>Math</h2><ul><li class="person">Ada</li><li class="person">Katherine</li></ul></div><div class="group"><h2>Navy</h2><ul><li class="person">Grace</li></ul></div>
      <button type="button">Save</button>
    </section>`
  const {window, template, target, root} = createPage(source, server)
  const changes = recordChanges(window, root)
  let saves = 0
  const mounted = component({
    source: template,
    bindings: [
      repeat('.group', ({data}) => untyped(data).groups, [
        text('h2', ({item}) => untyped(item).title),
        repeat('.person', ({item}) => untyped(item).people, [
          text(':scope', ({item}) => untyped(item)),
        ]),
        classToggle(':scope', 'empty', ({item}) => {
          return untyped(item).people.length === 0
        }),
      ]),
      repeat(
        '#profile',
        ({data}) => untyped(data).selected ? [untyped(data).selected] : [],
        [text('.name', ({item}) => untyped(item))],
      ),
      on('button', 'click', () => {
        saves += 1
      }),
    ],
  }).mount(target)
  const groups = [
    {title: 'Math', people: ['Ada', 'Katherine']},
    {title: 'Navy', people: ['Grace']},
  ]

  mounted.update({groups, selected: null})
  assert.deepEqual(changes(), [])

  root.querySelector('button')?.dispatchEvent(
    new window.Event('click', {bubbles: true}),
  )
  assert.equal(saves, 1)

  mounted.update({
    groups: [{title: 'Math', people: ['Ada']}, groups[1], {title: 'New', people: []}],
    selected: 'Grace',
  })

  assert.deepEqual(texts(root, 'h2'), ['Math', 'Navy', 'New'])
  assert.deepEqual(texts(root, '.person'), ['Ada', 'Grace'])
  assert.equal(root.querySelectorAll('.group')[2]?.classList.contains('empty'), true)
  assert.equal(root.querySelector('#profile .name')?.textContent, 'Grace')
  // The region is before the button, as in the source.
  assert.equal(root.querySelector('#profile')?.nextElementSibling?.localName, 'button')
})

test('mount connects a child component in a list', () => {
  const source = '<ul><li class="row"><div class="slot"></div></li></ul>'
  const server = '<ul><li class="row"><div class="slot"><article class="card"><b class="name">Ada</b><i class="tag">x</i><i class="tag">y</i></article></div></li><li class="row"><div class="slot"><article class="card"><b class="name">Grace</b></article></div></li></ul>'
  const {window, document, template, target, root} = createPage(source, server)
  const cardTemplate = document.createElement('template')
  cardTemplate.innerHTML = '<article class="card"><b class="name">Name</b><i class="tag">Tag</i></article>'
  /** @type {string[]} */
  const clicks = []
  const card = component({
    source: cardTemplate,
    bindings: [
      text('.name', ({data}) => untyped(data).name),
      repeat('.tag', ({data}) => untyped(data).tags, [
        text(':scope', ({item}) => untyped(item)),
      ]),
      on('.name', 'click', (_event, name) => {
        clicks.push(name.textContent ?? '')
      }),
    ],
  })
  const cards = Array.from(root.querySelectorAll('.card'))
  const changes = recordChanges(window, root)
  const mounted = component({
    source: template,
    bindings: [
      repeat('.row', ({data}) => /** @type {unknown[]} */ (data), [
        child('.slot', card, ({item}) => item),
      ]),
    ],
  }).mount(target)
  const people = [
    {name: 'Ada', tags: ['x', 'y']},
    {name: 'Grace', tags: []},
  ]

  mounted.update(people)

  assert.deepEqual(changes(), [])
  assert.deepEqual(Array.from(root.querySelectorAll('.card')), cards)

  root.querySelectorAll('.name')[1]?.dispatchEvent(
    new window.Event('click', {bubbles: true}),
  )
  assert.deepEqual(clicks, ['Grace'])

  mounted.update([{name: 'Ada L.', tags: ['x']}, people[1], {name: 'Hedy', tags: ['z']}])

  assert.deepEqual(texts(root, '.name'), ['Ada L.', 'Grace', 'Hedy'])
  assert.deepEqual(texts(root, '.tag'), ['x', 'z'])
  assert.strictEqual(root.querySelector('.card'), cards[0])
})

test('unmount removes the root that the target had', () => {
  const {template, target, root} = createPage(listSource, serverList)
  const mounted = listComponent(template, false).mount(target)

  mounted.update({title: 'People', items})
  mounted.unmount()

  assert.equal(root.isConnected, false)
})

test('mount replaces the content of a target that has a different element', () => {
  const {template, target, root} = createPage(
    listSource,
    '<p>Loading</p><section><h1>Old</h1></section>',
  )
  const mounted = listComponent(template, false).mount(target)

  assert.notStrictEqual(mounted.root, root)
  assert.equal(root.isConnected, false)
  assert.equal(target.childNodes.length, 1)
  assert.strictEqual(target.firstChild, mounted.root)

  mounted.update({title: 'People', items})
  assert.deepEqual(texts(target, '.name'), ['Ada', 'Grace', 'Katherine'])
})

test('mount keeps the other nodes of a target that has the root', () => {
  const {template, target, root} = createPage(
    listSource,
    `${serverList}<footer>Footer</footer>`,
  )
  const mounted = listComponent(template, false).mount(target)

  mounted.update({title: 'People', items})

  assert.strictEqual(mounted.root, root)
  assert.equal(target.lastElementChild?.textContent, 'Footer')

  mounted.unmount()
  assert.equal(target.innerHTML, '<footer>Footer</footer>')
})

test('mount makes a copy of a source element that is in the target', () => {
  const {window} = new JSDOM(
    '<main><ul><li class="item">Item</li></ul></main>',
  )
  const {document} = window
  const target = /** @type {Element} */ (document.querySelector('main'))
  const source = /** @type {Element} */ (target.firstElementChild)
  const mounted = component({
    source,
    bindings: [
      repeat('.item', ({data}) => /** @type {string[]} */ (data), [
        text(':scope', ({item}) => item),
      ]),
    ],
  }).mount(target)

  assert.notStrictEqual(mounted.root, source)
  assert.equal(source.isConnected, false)

  mounted.update([])
  assert.deepEqual(texts(target, '.item'), [])
  assert.equal(source.innerHTML, '<li class="item">Item</li>')
})

test('an error in a binding keeps the root that the target had', () => {
  const {template, target, root} = createPage(listSource, serverList)
  const html = target.innerHTML

  assert.throws(() => component({
    source: template,
    bindings: [
      {
        connect() {
          throw new Error('connect failed')
        },
      },
    ],
  }).mount(target), /connect failed/)

  assert.strictEqual(target.firstElementChild, root)
  assert.equal(target.innerHTML, html)
})
