// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {unmatchedSelectors} from '../src/check.js'
import {
  attr,
  child,
  classToggle,
  component,
  on,
  prop,
  repeat,
  style,
  text,
} from '../src/index.js'

/**
 * @param {string} markup
 */
function createTemplate(markup) {
  const {document} = new JSDOM().window
  const template = document.createElement('template')
  template.innerHTML = markup
  return template
}

test('a component whose selectors all match has an empty list', () => {
  const counter = component({
    source: createTemplate(
      '<section><output>0</output><button>+</button><ul><li><b></b></li></ul></section>',
    ),
    bindings: [
      text('output', () => 1),
      classToggle(':scope', 'active', () => true),
      repeat('li', () => [], [text('b', () => 'x')]),
      on('button', 'click', () => {}),
    ],
  })

  assert.deepEqual(unmatchedSelectors(counter), [])
})

test('the list has each binding that matches no element, in declaration order', () => {
  const options = {
    source: createTemplate(
      '<section><output>0</output><button>+</button><ul><li><b></b></li></ul></section>',
    ),
    bindings: [
      text('ouput', () => 1),
      prop('button', 'disabled', () => false),
      prop('buton', 'disabled', () => false),
      attr('.missing', 'title', () => 'x'),
      classToggle('.missing', 'active', () => true),
      style('.missing', 'color', () => 'red'),
      repeat('li', () => [], [
        text('b', () => 'x'),
        // The output is not in the repeated element.
        text('output', () => 'x'),
      ]),
      repeat('.row', () => []),
      on('.save', 'click', () => {}),
    ],
  }

  const expected = [
    {binding: 'text', selector: 'ouput'},
    {binding: 'prop', selector: 'buton'},
    {binding: 'attr', selector: '.missing'},
    {binding: 'classToggle', selector: '.missing'},
    {binding: 'style', selector: '.missing'},
    {binding: 'text', selector: 'output'},
    {binding: 'repeat', selector: '.row'},
    {binding: 'on', selector: '.save'},
  ]

  assert.deepEqual(unmatchedSelectors(options), expected)
  assert.deepEqual(unmatchedSelectors(component(options)), expected)
})

test('a selector does not match in the container of a child', () => {
  const card = component({source: createTemplate('<b class="name"></b>')})
  const source = createTemplate(
    '<section><div class="slot"><b class="name">Default</b></div></section>',
  )

  assert.deepEqual(
    unmatchedSelectors({
      source,
      bindings: [
        child('.slot', card, () => ({})),
        text('.name', () => 'x'),
        child('.absent', card, () => ({})),
      ],
    }),
    [
      {binding: 'text', selector: '.name'},
      {binding: 'child', selector: '.absent'},
    ],
  )
  // The check does not change the source.
  assert.equal(source.content.querySelector('.name')?.textContent, 'Default')
})

test('a selector that is not valid gives the error of the browser', () => {
  assert.throws(
    () => unmatchedSelectors({
      source: createTemplate('<section></section>'),
      bindings: [text('[', () => 'x')],
    }),
    {name: 'SyntaxError'},
  )
})
