// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { installMoveBefore } from '../src/shims/move-before.js'
import {
  attr,
  classToggle,
  component,
  prop,
  style,
  text,
} from '../src/index.js'

/**
 * @typedef {{open: boolean, label: string, fail?: boolean}} RowData
 */

/**
 * @param {string} markup
 */
function mountRow(
  markup,
  /** @type {ReadonlyArray<import('../src/types.js').Binding<RowData>>} */
  bindings,
) {
  const { window } = new JSDOM()
  installMoveBefore(window)
  const document = window.document
  const template = document.createElement('template')
  template.innerHTML = markup
  const mounted = component({ source: template, bindings })
    .mount(document.body)
  const observer = new window.MutationObserver(() => {})
  observer.observe(mounted.root, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  })

  return {
    mounted,
    /** @param {string} selector */
    textOf(selector) {
      return mounted.root.querySelector(selector)?.textContent
    },
    /** @returns {number} The number of DOM mutations since the last call. */
    mutations() {
      return observer.takeRecords().length
    },
  }
}

/**
 * Each selector resolves one time, in the component source. A write of a
 * binding does not change the elements that a different binding matched.
 *
 * `closed` is a source that the reader does not match. `open` is a source
 * that the reader matches.
 */
const writers = [
  {
    name: 'classToggle',
    closed: '<section><p class="row"><span class="label">default</span></p></section>',
    open: '<section><p class="row open"><span class="label">default</span></p></section>',
    writer: classToggle('.row', 'open', (
      /** @type {{data: RowData}} */ { data },
    ) => data.open),
    reader: '.row.open .label',
  },
  {
    name: 'attr',
    closed: '<section><p class="row"><span class="label">default</span></p></section>',
    open: '<section><p class="row" data-open><span class="label">default</span></p></section>',
    writer: attr('.row', 'data-open', (
      /** @type {{data: RowData}} */ { data },
    ) => data.open),
    reader: '.row[data-open] .label',
  },
  {
    name: 'prop',
    closed: '<section><p class="row" hidden><span class="label">default</span></p></section>',
    open: '<section><p class="row"><span class="label">default</span></p></section>',
    writer: prop('.row', (
      /** @type {{data: RowData}} */ { data },
    ) => !data.open, 'hidden'),
    reader: '.row:not([hidden]) .label',
  },
  {
    name: 'style',
    closed: '<section><p class="row"><span class="label">default</span></p></section>',
    open: '<section><p class="row" style="display: block"><span class="label">default</span></p></section>',
    writer: style('.row', 'display', (
      /** @type {{data: RowData}} */ { data },
    ) => data.open ? 'block' : ''),
    reader: '.row[style*="block"] .label',
  },
]

for (const { name, closed, open, writer, reader } of writers) {
  test(`a ${name} write gives a later selector no new match`, () => {
    const row = mountRow(closed, [
      writer,
      text(reader, ({ data }) => data.label),
    ])

    // The reader has no match in the source, so its projection does not
    // run, also after the writer makes the selector match.
    row.mounted.update({ open: true, label: 'first' })
    assert.equal(row.textOf('.label'), 'default')

    row.mounted.update({ open: true, label: 'second' })
    assert.equal(row.textOf('.label'), 'default')
    row.mounted.unmount()
  })

  test(`a ${name} write keeps the matches of a later selector`, () => {
    const row = mountRow(open, [
      writer,
      text(reader, ({ data }) => data.label),
    ])

    row.mounted.update({ open: true, label: 'first' })
    assert.equal(row.textOf('.label'), 'first')
    row.mutations()

    row.mounted.update({ open: true, label: 'first' })
    assert.equal(row.mutations(), 0)

    // The selector does not match the element now, but the binding keeps
    // the element that it matched in the source.
    row.mounted.update({ open: false, label: 'closed' })
    assert.equal(row.mounted.root.querySelector(reader), null)
    assert.equal(row.textOf('.label'), 'closed')

    row.mounted.update({ open: true, label: 'back' })
    assert.equal(row.textOf('.label'), 'back')
    row.mounted.unmount()
  })
}

test('a projection failure after an earlier write changes no DOM', () => {
  const row = mountRow(
    '<section><p class="row"><span class="label">default</span></p></section>',
    [
      classToggle('.row', 'open', ({ data }) => data.open),
      text('.row .label', ({ data }) => {
        if (data.fail === true) {
          throw new Error('projection failed')
        }

        return data.label
      }),
    ],
  )

  assert.throws(
    () => row.mounted.update({ open: true, label: 'first', fail: true }),
    /projection failed/,
  )
  assert.equal(row.mutations(), 0)
  assert.equal(row.mounted.root.querySelector('.row')?.className, 'row')
  assert.equal(row.textOf('.label'), 'default')

  row.mounted.update({ open: true, label: 'first' })
  assert.equal(row.textOf('.label'), 'first')
  row.mounted.unmount()
})

test('each projection runs once for each source match, in declaration order', () => {
  /** @type {string[]} */
  const calls = []
  const row = mountRow(
    '<section><p class="row"><span class="label">default</span><span class="label">default</span></p></section>',
    [
      classToggle('.row', 'open', ({ data }) => {
        calls.push('writer')
        return data.open
      }),
      text('.row .label', ({ data }) => {
        calls.push('reader')
        return data.label
      }),
    ],
  )

  row.mounted.update({ open: true, label: 'first' })
  assert.deepEqual(calls, ['writer', 'reader', 'reader'])

  row.mounted.update({ open: false, label: 'second' })
  assert.deepEqual(
    calls,
    ['writer', 'reader', 'reader', 'writer', 'reader', 'reader'],
  )
  row.mounted.unmount()
})

test('a text write does not change the matches of a later :empty selector', () => {
  const { window } = new JSDOM()
  installMoveBefore(window)
  const document = window.document
  const template = document.createElement('template')
  template.innerHTML = '<section><span class="count"></span><span class="hint">default</span><span class="count">0</span><span class="hint">default</span></section>'
  const mounted = component({
    source: template,
    bindings: [
      text('.count', ({ data }) => /** @type {{count: string}} */ (data).count),
      text('.count:empty + .hint', ({ data }) => {
        return `hint ${/** @type {{count: string}} */ (data).count}`
      }),
    ],
  }).mount(document.body)
  const hints = () => Array.from(
    mounted.root.querySelectorAll('.hint'),
    hint => hint.textContent,
  )

  // Only the first count is empty in the source.
  mounted.update({ count: '3' })
  assert.deepEqual(hints(), ['hint 3', 'default'])

  mounted.update({ count: '' })
  assert.deepEqual(hints(), ['hint ', 'default'])
  mounted.unmount()
})

test('a text write that removes elements keeps the other targets', () => {
  const row = mountRow(
    '<section><h1 class="title"><b>old</b></h1><p class="row"><span class="label">default</span></p></section>',
    [
      text('.title', ({ data }) => data.label),
      classToggle('.row', 'open', ({ data }) => data.open),
      text('.row .label', ({ data }) => data.label),
    ],
  )

  row.mounted.update({ open: true, label: 'first' })
  assert.equal(row.textOf('.title'), 'first')
  assert.equal(row.mounted.root.querySelector('.title b'), null)
  assert.equal(row.textOf('.label'), 'first')
  row.mutations()

  row.mounted.update({ open: true, label: 'first' })
  assert.equal(row.mutations(), 0)
  row.mounted.unmount()
})

test('an element that other code adds is not a target', () => {
  const row = mountRow(
    '<section><p class="row"><span class="label">default</span></p></section>',
    [text('.label', ({ data }) => data.label)],
  )
  const added = row.mounted.root.ownerDocument.createElement('span')
  added.className = 'label'
  added.textContent = 'foreign'

  row.mounted.update({ open: true, label: 'first' })
  row.mounted.root.append(added)
  row.mounted.update({ open: true, label: 'second' })

  assert.equal(row.textOf('.row .label'), 'second')
  assert.equal(added.textContent, 'foreign')

  // The binding keeps a target that other code moved or removed.
  const label = /** @type {Element} */ (
    row.mounted.root.querySelector('.row .label')
  )
  label.remove()
  row.mounted.update({ open: true, label: 'third' })
  assert.equal(label.textContent, 'third')
  assert.equal(added.textContent, 'foreign')
  row.mounted.unmount()
})
