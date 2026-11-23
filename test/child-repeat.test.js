// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {
  child,
  component,
  on,
  prop,
  repeat,
  text,
} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/** @typedef {{id: string, name: string}} Member */
/** @typedef {{members: Member[]}} Team */

function createDocument() {
  const {window} = new JSDOM()
  installMoveBefore(window)
  return {window, document: window.document}
}

/**
 * @param {Document} document
 * @param {string} markup
 */
function createTemplate(document, markup) {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template
}

/**
 * @param {Element} root
 * @param {string} selector
 */
function texts(root, selector) {
  return Array.from(root.querySelectorAll(selector), el => el.textContent)
}

/**
 * A card that shows the name of one member.
 *
 * @param {Document} document
 * @param {ReadonlyArray<import('../src/types.js').Binding<any>>} [bindings]
 */
function memberCard(document, bindings = []) {
  return component({
    source: createTemplate(
      document,
      '<article class="card"><b class="name">Default</b><button>x</button></article>',
    ),
    bindings: [
      text('.name', ({data}) => /** @type {Member} */ (data).name),
      ...bindings,
    ],
  })
}

const ada = {id: 'ada', name: 'Ada'}
const grace = {id: 'grace', name: 'Grace'}
const katherine = {id: 'katherine', name: 'Katherine'}

test('a child in the list of a repeat gives one child to each occurrence', () => {
  const {document} = createDocument()
  /** @type {Array<{index: number, heading: string}>} */
  const contexts = []
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot">Default slot</div></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {Team} */ (data).members, [
        child('.slot', memberCard(document), context => {
          contexts.push({
            index: context.index,
            heading: /** @type {{heading: string}} */ (context.data).heading,
          })
          return context.item
        }),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update({heading: 'Team', members: [ada, grace]})

  assert.deepEqual(texts(mounted.root, '.card .name'), ['Ada', 'Grace'])
  assert.deepEqual(contexts, [
    {index: 0, heading: 'Team'},
    {index: 1, heading: 'Team'},
  ])
  // The child replaces the content of its container.
  assert.equal(mounted.root.textContent?.includes('Default slot'), false)

  const cards = Array.from(mounted.root.querySelectorAll('.card'))

  mounted.update({heading: 'Team', members: [ada, {id: 'grace', name: 'Grace H.'}, katherine]})

  assert.deepEqual(
    texts(mounted.root, '.card .name'),
    ['Ada', 'Grace H.', 'Katherine'],
  )
  assert.strictEqual(mounted.root.querySelectorAll('.card')[0], cards[0])
  assert.strictEqual(mounted.root.querySelectorAll('.card')[1], cards[1])

  mounted.update({heading: 'Team', members: []})
  assert.equal(mounted.root.querySelectorAll('.card').length, 0)
})

test('a child outside the list gets its context from the position of its container', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot"></div></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {Team} */ (data).members),
      child('.row .slot', memberCard(document), ({item}) => item),
    ],
  }).mount(document.createElement('div'))

  mounted.update({members: [ada, grace]})

  assert.deepEqual(texts(mounted.root, '.card .name'), ['Ada', 'Grace'])
})

test('a repeated element can be the container of a child', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(document, '<ul><li class="row"></li></ul>'),
    bindings: [
      repeat('.row', ({data}) => /** @type {Team} */ (data).members, [
        child(':scope', memberCard(document), ({item}) => item),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update({members: [ada, grace]})

  assert.deepEqual(texts(mounted.root, '.row > .card > .name'), ['Ada', 'Grace'])
})

test('a keyed child keeps its element and state when its row moves', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot"></div></li></ul>',
    ),
    bindings: [
      repeat(
        '.row',
        ({data}) => /** @type {Team} */ (data).members,
        ({item}) => item.id,
        [child('.slot', memberCard(document), ({item}) => item)],
      ),
    ],
  }).mount(document.createElement('div'))

  mounted.update({members: [ada, grace, katherine]})

  const [first, second, third] = Array.from(
    mounted.root.querySelectorAll('.card'),
  )

  mounted.update({members: [katherine, ada, grace]})

  assert.deepEqual(
    texts(mounted.root, '.card .name'),
    ['Katherine', 'Ada', 'Grace'],
  )
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.card')),
    [third, first, second],
  )
})

test('a conditional region can contain a child', () => {
  const {document, window} = createDocument()
  /** @type {string[]} */
  const clicks = []
  const card = memberCard(document, [
    on('button', 'click', (_event, button) => {
      clicks.push(button.parentElement?.querySelector('.name')?.textContent ?? '')
    }),
  ])
  const mounted = component({
    source: createTemplate(
      document,
      '<section><h1>Team</h1><aside id="profile"><div class="slot"></div></aside></section>',
    ),
    bindings: [
      repeat(
        '#profile',
        ({data}) => {
          const selected = /** @type {{selected: Member | null}} */ (data).selected
          return selected === null ? [] : [selected]
        },
        [child('.slot', card, ({item}) => item)],
      ),
    ],
  }).mount(document.createElement('div'))

  mounted.update({selected: null})
  assert.equal(mounted.root.querySelector('#profile'), null)

  mounted.update({selected: ada})
  assert.deepEqual(texts(mounted.root, '#profile .card .name'), ['Ada'])

  const button = /** @type {Element} */ (mounted.root.querySelector('button'))
  button.dispatchEvent(new window.Event('click', {bubbles: true}))
  assert.deepEqual(clicks, ['Ada'])

  mounted.update({selected: null})
  assert.equal(mounted.root.querySelector('#profile'), null)

  // The removed child has no listener.
  button.dispatchEvent(new window.Event('click', {bubbles: true}))
  assert.deepEqual(clicks, ['Ada'])

  mounted.update({selected: grace})
  assert.deepEqual(texts(mounted.root, '#profile .card .name'), ['Grace'])
})

test('events stay in the component that owns the element', () => {
  const {document, window} = createDocument()
  /** @type {string[]} */
  const calls = []
  const card = memberCard(document, [
    on('button', 'click', () => calls.push('child button')),
    on('.card', 'click', () => calls.push('child root')),
  ])
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot"></div></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {Team} */ (data).members, [
        child('.slot', card, ({item}) => item),
      ]),
      // This selector matches only an element of the parent.
      on('button', 'click', () => calls.push('parent button')),
      on('.slot', 'click', () => calls.push('parent slot')),
    ],
  }).mount(document.createElement('div'))

  mounted.update({members: [ada, grace]})

  const button = /** @type {Element} */ (
    mounted.root.querySelectorAll('button')[1]
  )

  button.dispatchEvent(new window.Event('click', {bubbles: true}))
  assert.deepEqual(calls, ['child button', 'child root', 'parent slot'])

  mounted.unmount()
  calls.length = 0
  button.dispatchEvent(new window.Event('click', {bubbles: true}))
  assert.deepEqual(calls, [])
})

test('the selectors of the parent do not match in a repeated child', () => {
  const {document} = createDocument()
  let parentProjections = 0
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot"><b class="name">In slot</b></div></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {Team} */ (data).members, [
        child('.slot', memberCard(document), ({item}) => item),
        text('.name', () => {
          parentProjections += 1
          return 'Parent'
        }),
        prop('.slot', 'hidden', ({index}) => index === 1),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update({members: [ada, grace]})

  assert.equal(parentProjections, 0)
  assert.deepEqual(texts(mounted.root, '.name'), ['Ada', 'Grace'])
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.slot'),
      slot => /** @type {HTMLElement} */ (slot).hidden,
    ),
    [false, true],
  )
})

test('a component can contain itself in a repeat', () => {
  const {document} = createDocument()
  /** @typedef {{label: string, children: Node[]}} Node */
  /** @type {Array<import('../src/types.js').Binding<Node>>} */
  const bindings = [
    text(':scope > .label', ({data}) => /** @type {Node} */ (data).label),
  ]
  /** @type {import('../src/index.js').Component<Node>} */
  const tree = component({
    source: createTemplate(
      document,
      '<div class="node"><span class="label"></span><ul><li></li></ul></div>',
    ),
    bindings,
  })

  // The component exists now, so its own binding list can name it.
  bindings.push(
    repeat(':scope > ul > li', ({data}) => /** @type {Node} */ (data).children, [
      child(':scope', tree, ({item}) => item),
    ]),
  )

  const mounted = tree.mount(document.createElement('div'))

  mounted.update({
    label: 'root',
    children: [
      {label: 'a', children: [{label: 'a1', children: []}]},
      {label: 'b', children: []},
    ],
  })

  assert.deepEqual(texts(mounted.root, '.label'), ['root', 'a', 'a1', 'b'])

  mounted.update({
    label: 'root',
    children: [{label: 'a', children: []}],
  })

  assert.deepEqual(texts(mounted.root, '.label'), ['root', 'a'])
})

test('a nullish child projection keeps the child as it is', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot"></div></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {Array<Member | null>} */ (data), [
        child('.slot', memberCard(document), ({item}) => item),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update([ada, null])
  assert.deepEqual(texts(mounted.root, '.card .name'), ['Ada', 'Default'])

  mounted.update([null, grace])
  assert.deepEqual(texts(mounted.root, '.card .name'), ['Ada', 'Grace'])
})

test('an error in the projection of a repeated child leaves the DOM as it was', () => {
  const {document} = createDocument()
  const card = component({
    source: createTemplate(document, '<b class="name"></b>'),
    bindings: [
      text('.name', ({data}) => {
        const member = /** @type {Member} */ (data)

        if (member.name === 'Bad') {
          throw new Error('Projection failed')
        }

        return member.name
      }),
    ],
  })
  const mounted = component({
    source: createTemplate(
      document,
      '<section><h1></h1><ul><li class="row"><div class="slot"></div></li></ul></section>',
    ),
    bindings: [
      text('h1', ({data}) => /** @type {{heading: string}} */ (data).heading),
      repeat('.row', ({data}) => /** @type {Team} */ (data).members, [
        child('.slot', card, ({item}) => item),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update({heading: 'One', members: [ada, grace]})

  const before = mounted.root.innerHTML

  assert.throws(
    () => mounted.update({
      heading: 'Two',
      members: [ada, grace, {id: 'bad', name: 'Bad'}],
    }),
    /Projection failed/,
  )
  assert.equal(mounted.root.innerHTML, before)

  mounted.update({heading: 'Three', members: [katherine]})
  assert.equal(mounted.root.querySelector('h1')?.textContent, 'Three')
  assert.deepEqual(texts(mounted.root, '.name'), ['Katherine'])
})

test('a child selector that matches some containers gives a child to each', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      '<section><div class="slot"></div><div class="slot"></div></section>',
    ),
    bindings: [
      child('.slot', memberCard(document), ({data}) => data),
    ],
  }).mount(document.createElement('div'))

  // The children are in the DOM from the mount.
  assert.deepEqual(texts(mounted.root, '.card .name'), ['Default', 'Default'])

  mounted.update(ada)
  assert.deepEqual(texts(mounted.root, '.card .name'), ['Ada', 'Ada'])
})

test('a repeated child can have its own repeat and child', () => {
  const {document} = createDocument()
  const tag = component({
    source: createTemplate(document, '<i class="tag"></i>'),
    bindings: [text(':scope', ({data}) => /** @type {string} */ (data))],
  })
  const card = component({
    source: createTemplate(
      document,
      '<article><b class="name"></b><span class="tag-slot"></span><p class="note"></p></article>',
    ),
    bindings: [
      text('.name', ({data}) => /** @type {{name: string}} */ (data).name),
      repeat('.note', ({data}) => /** @type {{notes: string[]}} */ (data).notes, [
        text(':scope', ({item}) => item),
      ]),
      child('.tag-slot', tag, ({data}) => /** @type {{tag: string}} */ (data).tag),
    ],
  })
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><div class="slot"></div></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {unknown[]} */ (data), [
        child('.slot', card, ({item}) => item),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update([
    {name: 'Ada', tag: 'math', notes: ['one', 'two']},
    {name: 'Grace', tag: 'navy', notes: []},
  ])

  assert.deepEqual(texts(mounted.root, '.name'), ['Ada', 'Grace'])
  assert.deepEqual(texts(mounted.root, '.tag'), ['math', 'navy'])
  assert.deepEqual(texts(mounted.root, '.note'), ['one', 'two'])
})

/**
 * jsdom has no Trusted Types API. This factory accepts only the values that
 * its policy made.
 *
 * @param {import('jsdom').DOMWindow} window
 * @returns {(markup: string) => object}
 */
function installTrustedHTML(window) {
  const trusted = new WeakSet()

  Reflect.set(window, 'trustedTypes', {
    /** @param {unknown} value */
    isHTML: value => typeof value === 'object'
      && value !== null
      && trusted.has(value),
  })

  return markup => {
    const value = {toString: () => markup}
    trusted.add(value)
    return value
  }
}

test('a markup write in the parent and in a repeated child keeps each owner', () => {
  const {document, window} = createDocument()
  const html = installTrustedHTML(window)
  const card = component({
    source: createTemplate(
      document,
      '<article class="card"><div class="body"></div></article>',
    ),
    bindings: [
      prop('.body', 'innerHTML', ({data}) => {
        return html(`<b class="name">${/** @type {Member} */ (data).name}</b>`)
      }),
      // The markup of the child creates this target.
      prop('.name', 'title', ({data}) => /** @type {Member} */ (data).id),
    ],
  })
  let parentNameProjections = 0
  const mounted = component({
    source: createTemplate(
      document,
      '<section><header></header><ul><li class="row"><div class="slot"></div></li></ul></section>',
    ),
    bindings: [
      prop('header', 'innerHTML', () => html('<h1 class="title">Team</h1>')),
      text('.title', ({data}) => /** @type {{heading: string}} */ (data).heading),
      // The parent has no element with this class.
      text('.name', () => {
        parentNameProjections += 1
        return 'Parent'
      }),
      repeat('.row', ({data}) => /** @type {Team} */ (data).members, [
        child('.slot', card, ({item}) => item),
      ]),
    ],
  }).mount(document.createElement('div'))

  mounted.update({heading: 'People', members: [ada, grace]})

  assert.equal(mounted.root.querySelector('.title')?.textContent, 'People')
  assert.deepEqual(texts(mounted.root, '.card .name'), ['Ada', 'Grace'])
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.name'), el => el.getAttribute('title')),
    ['ada', 'grace'],
  )
  assert.equal(parentNameProjections, 0)

  const names = Array.from(mounted.root.querySelectorAll('.name'))

  mounted.update({heading: 'Staff', members: [ada, grace, katherine]})

  assert.equal(mounted.root.querySelector('.title')?.textContent, 'Staff')
  assert.deepEqual(
    texts(mounted.root, '.card .name'),
    ['Ada', 'Grace', 'Katherine'],
  )
  // Equal markup replaces no element.
  assert.strictEqual(mounted.root.querySelectorAll('.name')[0], names[0])
  assert.equal(parentNameProjections, 0)
})
