// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {component, prop, repeat, text} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/**
 * @template Data
 * @typedef {import('../src/index.js').ComponentOptions<Data>} Options
 */

/** @typedef {{id: number, name: string}} Item */

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
 * Mounts one `.v` element whose text is the `v` field of the data.
 *
 * @param {Document} document
 * @param {string} [content] The source content of the `.v` element.
 */
function mountValue(document, content = '0') {
  /** @type {Options<{v: string | number}>} */
  const options = {
    source: createTemplate(
      document,
      `<p><span class="v">${content}</span></p>`,
    ),
    bindings: [text('.v', ({data}) => data.v)],
  }
  const mounted = component(options).mount(document.body)
  const span = required(mounted.root.querySelector('.v'))

  return {mounted, span}
}

/**
 * Counts the `textContent` reads and writes on one element.
 *
 * @param {import('jsdom').DOMWindow} window
 * @param {Element} element
 */
function countTextContentAccess(window, element) {
  const native = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(window.Node.prototype, 'textContent')
  )
  const counts = {reads: 0, writes: 0}

  Object.defineProperty(element, 'textContent', {
    configurable: true,
    get() {
      counts.reads += 1
      return native.get?.call(this)
    },
    set(value) {
      counts.writes += 1
      native.set?.call(this, value)
    },
  })
  return counts
}

/**
 * @param {Element | null | undefined} element
 * @returns {Element}
 */
function required(element) {
  assert.ok(element)
  return element
}

test('text does not read the live DOM for an unchanged projection', () => {
  const {document, window} = createDocument()
  const {mounted, span} = mountValue(document)

  mounted.update({v: 1})
  const counts = countTextContentAccess(window, span)
  mounted.update({v: 1})
  mounted.update({v: 1})

  assert.deepEqual(counts, {reads: 0, writes: 0})
  assert.equal(span.firstChild?.nodeValue, '1')
})

test('text keeps the text node when the value changes', () => {
  const {document} = createDocument()
  const {mounted, span} = mountValue(document)

  mounted.update({v: 'first'})
  const node = span.firstChild
  mounted.update({v: 'second'})

  assert.equal(span.firstChild, node)
  assert.equal(span.childNodes.length, 1)
  assert.equal(span.textContent, 'second')
})

test('the first update does not write text that the source already has', () => {
  const {document} = createDocument()
  const {mounted, span} = mountValue(document, '3')
  const node = span.firstChild

  mounted.update({v: 3})

  assert.equal(span.firstChild, node)
  assert.equal(span.textContent, '3')
})

test('an empty text value removes the child nodes', () => {
  const {document} = createDocument()
  const {mounted, span} = mountValue(document)

  mounted.update({v: ''})
  assert.equal(span.childNodes.length, 0)

  mounted.update({v: 'again'})
  assert.equal(span.childNodes.length, 1)
  assert.equal(span.textContent, 'again')
})

test('text replaces element children with one text node', () => {
  const {document} = createDocument()
  const {mounted, span} = mountValue(document, '<b>bold</b> tail')

  mounted.update({v: 'plain'})

  assert.equal(span.childNodes.length, 1)
  assert.equal(span.firstChild?.nodeType, 3)
  assert.equal(span.textContent, 'plain')
})

test('a foreign text write stays until the projection changes', () => {
  const {document} = createDocument()
  const {mounted, span} = mountValue(document)

  mounted.update({v: 3})
  span.textContent = 'foreign'
  mounted.update({v: 3})
  assert.equal(span.textContent, 'foreign')

  mounted.update({v: 4})
  assert.equal(span.textContent, '4')
})

test('a foreign element in a text sink does not fault the component', () => {
  const {document} = createDocument()
  /** @type {Options<{v: string, w: string, late: string}>} */
  const options = {
    source: createTemplate(
      document,
      '<p><span class="v">0</span><span class="w">0</span></p>',
    ),
    bindings: [
      text('.v', ({data}) => data.v),
      text('.w', ({data}) => data.w),
      text('.late', ({data}) => data.late),
    ],
  }
  const mounted = component(options).mount(document.body)
  const span = required(mounted.root.querySelector('.v'))

  mounted.update({v: 'a', w: 'w', late: 'x'})
  const late = document.createElement('i')
  late.className = 'late'
  late.textContent = 'foreign'
  span.append(late)

  // The selectors resolved in the source, so the foreign element is not a
  // target. An unchanged projection does not write, so the element stays.
  mounted.update({v: 'a', w: '', late: 'y'})
  assert.equal(late.textContent, 'foreign')
  assert.strictEqual(late.parentNode, span)

  mounted.update({v: 'b', w: '', late: 'y'})
  assert.equal(span.textContent, 'b')
  assert.equal(span.querySelector('.late'), null)
})

test('the last of two text declarations for one element wins', () => {
  const {document} = createDocument()
  /** @type {Options<{first: string, last: string}>} */
  const options = {
    source: createTemplate(document, '<p><span class="v">0</span></p>'),
    bindings: [
      text('.v', ({data}) => data.first),
      text('span', ({data}) => data.last),
    ],
  }
  const mounted = component(options).mount(document.body)
  const span = required(mounted.root.querySelector('.v'))

  mounted.update({first: 'a', last: 'z'})
  assert.equal(span.textContent, 'z')

  mounted.update({first: 'b', last: 'z'})
  assert.equal(span.textContent, 'z')

  mounted.update({first: 'b', last: 'y'})
  assert.equal(span.textContent, 'y')
})

test('text wins after an earlier content property for the same element', () => {
  const {document} = createDocument()
  /** @type {Options<{property: string, text: string}>} */
  const options = {
    source: createTemplate(document, '<p><span class="v">0</span></p>'),
    bindings: [
      prop('.v', 'textContent', ({data}) => data.property),
      text('.v', ({data}) => data.text),
    ],
  }
  const mounted = component(options).mount(document.body)
  const span = required(mounted.root.querySelector('.v'))

  mounted.update({property: 'P', text: 'T'})
  assert.equal(span.textContent, 'T')

  mounted.update({property: 'P', text: 'T'})
  assert.equal(span.textContent, 'T')
})

test('text writes a remembered value again after a content property', () => {
  const {document} = createDocument()
  /** @type {Options<{property: string, text: string}>} */
  const options = {
    source: createTemplate(document, '<p><span class="v">0</span></p>'),
    bindings: [
      prop('.v', 'textContent', ({data}) => data.property),
      text('.v', ({data}) => data.text),
    ],
  }
  const mounted = component(options).mount(document.body)
  const span = required(mounted.root.querySelector('.v'))

  mounted.update({property: 'P', text: ''})
  assert.equal(span.textContent, '')

  // The property write changes the text in each update, so the text
  // binding writes the same value again.
  mounted.update({property: 'P', text: ''})
  assert.equal(span.textContent, '')

  mounted.update({property: 'P', text: 'T'})
  assert.equal(span.textContent, 'T')
})

test('a repeated text sink updates only the changed occurrence', () => {
  const {document, window} = createDocument()
  /** @type {Options<{items: Item[]}>} */
  const options = {
    source: createTemplate(
      document,
      '<ul><li class="item"><span class="name">default</span></li></ul>',
    ),
    bindings: [
      repeat(
        '.item',
        ({data}) => data.items,
        ({item}) => /** @type {Item} */ (item).id,
        [text('.name', ({item}) => /** @type {Item} */ (item).name)],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  /** @type {Item} */
  const one = {id: 1, name: 'one'}
  /** @type {Item} */
  const three = {id: 3, name: 'three'}

  mounted.update({items: [one, {id: 2, name: 'two'}, three]})
  const names = Array.from(mounted.root.querySelectorAll('.name'))
  const nodes = names.map(name => name.firstChild)
  const counts = names.map(name => countTextContentAccess(window, name))

  mounted.update({items: [one, {id: 2, name: 'TWO'}, three]})

  assert.deepEqual(
    names.map(name => name.firstChild?.nodeValue),
    ['one', 'TWO', 'three'],
  )
  assert.deepEqual(names.map(name => name.firstChild), nodes)
  assert.deepEqual(counts, [
    {reads: 0, writes: 0},
    {reads: 0, writes: 0},
    {reads: 0, writes: 0},
  ])
})
