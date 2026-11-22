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
 * The writer is declared before the reader, so the reader's selector must
 * see the writer's prepared result in the same update.
 */
const writers = [
  {
    name: 'classToggle',
    markup: '<section><p class="row"><span class="label">default</span></p></section>',
    writer: classToggle('.row', 'open', (
      /** @type {{data: RowData}} */ { data },
    ) => data.open),
    reader: '.row.open .label',
  },
  {
    name: 'attr',
    markup: '<section><p class="row"><span class="label">default</span></p></section>',
    writer: attr('.row', 'data-open', (
      /** @type {{data: RowData}} */ { data },
    ) => data.open),
    reader: '.row[data-open] .label',
  },
  {
    name: 'prop',
    markup: '<section><p class="row" hidden><span class="label">default</span></p></section>',
    writer: prop('.row', (
      /** @type {{data: RowData}} */ { data },
    ) => !data.open, 'hidden'),
    reader: '.row:not([hidden]) .label',
  },
  {
    name: 'style',
    markup: '<section><p class="row"><span class="label">default</span></p></section>',
    writer: style('.row', 'display', (
      /** @type {{data: RowData}} */ { data },
    ) => data.open ? 'block' : ''),
    reader: '.row[style*="block"] .label',
  },
]

for (const { name, markup, writer, reader } of writers) {
  test(`a ${name} write changes which elements a later selector matches`, () => {
    const row = mountRow(markup, [
      writer,
      text(reader, ({ data }) => data.label),
    ])

    row.mounted.update({ open: true, label: 'first' })
    assert.equal(row.textOf('.label'), 'first')
    row.mutations()

    row.mounted.update({ open: true, label: 'first' })
    assert.equal(row.mutations(), 0)

    // The reader no longer matches, so its projection does not run and the
    // label keeps its previous value.
    row.mounted.update({ open: false, label: 'gone' })
    assert.equal(row.textOf('.label'), 'first')

    row.mounted.update({ open: true, label: 'back' })
    assert.equal(row.textOf('.label'), 'back')
    row.mounted.unmount()
  })
}

test('a projection failure after a selector-visible write changes no DOM', () => {
  const row = mountRow(
    '<section><p class="row"><span class="label">default</span></p></section>',
    [
      classToggle('.row', 'open', ({ data }) => data.open),
      text('.row.open .label', ({ data }) => {
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

test('each projection runs once for each match when planning moves to the inert copy', () => {
  /** @type {string[]} */
  const calls = []
  const row = mountRow(
    '<section><p class="row"><span class="label">default</span><span class="label">default</span></p></section>',
    [
      classToggle('.row', 'open', ({ data }) => {
        calls.push('writer')
        return data.open
      }),
      text('.row.open .label', ({ data }) => {
        calls.push('reader')
        return data.label
      }),
    ],
  )

  row.mounted.update({ open: true, label: 'first' })
  assert.deepEqual(calls, ['writer', 'reader', 'reader'])
  row.mounted.unmount()
})

test('a text write that empties an element changes a later :empty selector', () => {
  const { window } = new JSDOM()
  installMoveBefore(window)
  const document = window.document
  const template = document.createElement('template')
  template.innerHTML = '<section><span class="count"></span><span class="hint">default</span></section>'
  const mounted = component({
    source: template,
    bindings: [
      text('.count', ({ data }) => /** @type {{count: string}} */ (data).count),
      text('.count:empty + .hint', () => 'none'),
    ],
  }).mount(document.body)
  const hint = () => mounted.root.querySelector('.hint')?.textContent

  mounted.update({ count: '3' })
  assert.equal(hint(), 'default')

  mounted.update({ count: '' })
  assert.equal(hint(), 'none')

  mounted.update({ count: '4' })
  assert.equal(hint(), 'none')
  mounted.unmount()
})

test('content that replaces elements is still planned before a later selector', () => {
  const row = mountRow(
    '<section><h1 class="title"><b>old</b></h1><p class="row"><span class="label">default</span></p></section>',
    [
      text('.title', ({ data }) => data.label),
      classToggle('.row', 'open', ({ data }) => data.open),
      text('.row.open .label', ({ data }) => data.label),
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

test('staged structural dependencies keep the declaration order of other writes', () => {
  const row = mountRow(
    '<section><h1 class="title">old <b class="name">x</b></h1><p class="row"><span class="label">default</span></p></section>',
    [
      text('.title .name', ({ data }) => data.label),
      classToggle('.row', 'open', ({ data }) => data.open),
      text('.row.open .label', ({ data }) => data.label),
    ],
  )

  row.mounted.update({ open: true, label: 'first' })
  assert.equal(row.textOf('.title .name'), 'first')
  assert.equal(row.textOf('.label'), 'first')

  row.mounted.update({ open: false, label: 'second' })
  assert.equal(row.textOf('.title .name'), 'second')
  assert.equal(row.textOf('.label'), 'first')
  row.mounted.unmount()
})
