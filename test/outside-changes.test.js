// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {child, component, repeat, text} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

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

/** @typedef {{id: number, name: string, role: string}} Person */

/**
 * Mounts a keyed list. Each row has a name element and a role element.
 */
function mountPeople() {
  const {document, template} = createSource(
    '<ul><li class="row"><b class="name"></b><i class="role"></i></li></ul>',
  )
  /** @type {import('../src/index.js').ComponentOptions<Person[]>} */
  const options = {
    source: template,
    bindings: [
      repeat(
        '.row',
        ({data}) => data,
        ({item}) => /** @type {Person} */ (item).id,
        [
          text('.name', ({item}) => /** @type {Person} */ (item).name),
          text('.role', ({item}) => /** @type {Person} */ (item).role),
        ],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  const rows = () => Array.from(mounted.root.querySelectorAll('.row'))

  return {mounted, rows}
}

test('a target that other code removed gets no update and gives no error', () => {
  const {mounted, rows} = mountPeople()

  mounted.update([
    {id: 1, name: 'Ada', role: 'Engineer'},
    {id: 2, name: 'Grace', role: 'Admiral'},
    {id: 3, name: 'Edsger', role: 'Professor'},
  ])

  // Other code removes the role element from each row.
  for (const row of rows()) {
    row.querySelector('.role')?.remove()
  }

  mounted.update([
    {id: 1, name: 'Ada L.', role: 'Analyst'},
    {id: 2, name: 'Grace H.', role: 'Rear admiral'},
    {id: 3, name: 'Edsger D.', role: 'Author'},
  ])

  assert.deepEqual(
    rows().map(row => row.querySelector('.name')?.textContent),
    ['Ada L.', 'Grace H.', 'Edsger D.'],
  )
  assert.deepEqual(rows().map(row => row.querySelector('.role')), [
    null,
    null,
    null,
  ])

  // The list continues to follow the data.
  mounted.update([{id: 3, name: 'Edsger', role: 'Professor'}])
  assert.equal(rows().length, 1)
  assert.equal(rows()[0]?.querySelector('.name')?.textContent, 'Edsger')
})

test('a row that other code emptied gets no update and gives no error', () => {
  const {mounted, rows} = mountPeople()

  mounted.update([
    {id: 1, name: 'Ada', role: 'Engineer'},
    {id: 2, name: 'Grace', role: 'Admiral'},
  ])

  for (const row of rows()) {
    row.replaceChildren()
  }

  mounted.update([
    {id: 1, name: 'Ada L.', role: 'Analyst'},
    {id: 2, name: 'Grace H.', role: 'Rear admiral'},
  ])

  assert.deepEqual(rows().map(row => row.childNodes.length), [0, 0])
})

test('a list whose anchor other code removed gets no update and gives no error', () => {
  const {mounted, rows} = mountPeople()

  mounted.update([{id: 1, name: 'Ada', role: 'Engineer'}])

  // The anchor of the list is a comment after the last row.
  const anchor = /** @type {ChildNode} */ (mounted.root.lastChild)

  assert.equal(anchor.nodeType, 8)
  anchor.remove()

  mounted.update([
    {id: 1, name: 'Ada', role: 'Engineer'},
    {id: 2, name: 'Grace', role: 'Admiral'},
  ])
  mounted.update([
    {id: 2, name: 'Grace', role: 'Admiral'},
    {id: 1, name: 'Ada', role: 'Engineer'},
  ])

  assert.equal(rows().length, 1)
  assert.equal(rows()[0]?.querySelector('.name')?.textContent, 'Ada')

  mounted.unmount()
})

test('an update in an update gives error E13', () => {
  const {document, template} = createSource('<p></p>')
  /** @type {import('../src/index.js').MountedComponent<string> | undefined} */
  let mounted
  /** @type {unknown} */
  let nested
  /** @type {unknown} */
  let nestedUnmount

  mounted = component({
    source: template,
    bindings: [
      text('p', ({data}) => {
        if (data === 'again') {
          try {
            mounted?.update('nested')
          } catch (error) {
            nested = error
          }

          try {
            mounted?.unmount()
          } catch (error) {
            nestedUnmount = error
          }
        }
        return /** @type {string} */ (data)
      }),
    ],
  }).mount(document.body)

  mounted.update('first')
  mounted.update('again')

  for (const error of [nested, nestedUnmount]) {
    assert.ok(error instanceof Error)
    assert.equal(
      error.message,
      'Lumi E13: the component is in an update. An update or an unmount '
      + 'cannot start before the update is complete.',
    )
  }

  // The outer update is complete, and the component continues to work.
  assert.equal(mounted.root.textContent, 'again')
  mounted.update('last')
  assert.equal(mounted.root.textContent, 'last')
})

test('an update after an unmount and a second unmount do nothing', () => {
  const {document, template} = createSource('<p>Source</p>')
  let projections = 0
  const mounted = component({
    source: template,
    bindings: [
      text('p', ({data}) => {
        projections += 1
        return /** @type {string} */ (data)
      }),
    ],
  }).mount(document.body)

  mounted.update('first')
  mounted.unmount()
  mounted.update('second')
  mounted.unmount()

  assert.equal(projections, 1)
  assert.equal(mounted.root.textContent, 'first')
  assert.equal(document.body.childNodes.length, 0)
})

test('a child replaces the content of its container', () => {
  const {document, template} = createSource(
    '<section><div class="slot"><em>Placeholder</em></div></section>',
  )
  const childTemplate = document.createElement('template')
  childTemplate.innerHTML = '<output></output>'

  const mounted = component({
    source: template,
    bindings: [
      child(
        '.slot',
        component({
          source: childTemplate,
          bindings: [text('output', ({data}) => /** @type {string} */ (data))],
        }),
        ({data}) => data,
      ),
    ],
  }).mount(document.body)

  mounted.update('Value')

  assert.equal(
    mounted.root.innerHTML,
    '<div class="slot"><output>Value</output></div>',
  )
})

test('a repeat with an invalid third argument gives a warning', () => {
  const {document, template} = createSource('<ul><li></li></ul>')
  /** @type {string[]} */
  const warnings = []
  const original = console.warn

  console.warn = (/** @type {unknown[]} */ ...args) => {
    warnings.push(args.map(String).join(' '))
  }

  try {
    const mounted = component({
      source: template,
      bindings: [
        repeat(
          'li',
          ({data}) => /** @type {string[]} */ (data),
          /** @type {never} */ ('id'),
        ),
        text('li', ({item}) => /** @type {string} */ (item)),
      ],
    }).mount(document.body)

    mounted.update(['a', 'b'])
    assert.equal(mounted.root.textContent, 'ab')
  } finally {
    console.warn = original
  }

  assert.deepEqual(warnings, [
    'Lumi: repeat "li": the third argument is not a key projection or a '
    + 'list of bindings. It has no effect.',
  ])
})
