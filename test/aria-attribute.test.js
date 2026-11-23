// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {attr, component, repeat} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/** @typedef {{value: any, items?: any}} Data */

/**
 * @param {string} markup
 */
function setup(markup) {
  const {window} = new JSDOM()
  installMoveBefore(window)
  const template = window.document.createElement('template')
  template.innerHTML = markup
  /** @type {string[]} */
  const warnings = []
  window.console.warn = (/** @type {unknown[]} */ ...args) => {
    warnings.push(args.map(String).join(' '))
  }
  return {window, template, warnings}
}

/**
 * @param {string} name
 */
function ariaComponent(name, markup = '<div><button>Menu</button></div>') {
  const {window, template, warnings} = setup(markup)
  /** @type {import('../src/index.js').Component<Data>} */
  const definition = component({
    source: template,
    bindings: [attr('button', name, ({data}) => data.value)],
  })
  const target = window.document.createElement('div')
  return {definition, target, warnings}
}

const warningPattern = new RegExp(
  '^Lumi: attribute "button": the projection gave true for '
  + '"aria-expanded"\\. The value true writes an empty attribute, but an '
  + 'ARIA state is a string\\. Give the string "true" or "false", for '
  + 'example String\\(value\\)\\.$',
)

test('warns once when an ARIA attribute projects true', () => {
  const {definition, target, warnings} = ariaComponent('aria-expanded')
  const mounted = definition.mount(target)

  mounted.update({value: true})

  assert.equal(warnings.length, 1)
  assert.match(warnings[0] ?? '', warningPattern)
  assert.equal(
    mounted.root.querySelector('button')?.getAttribute('aria-expanded'),
    '',
  )
})

test('does not repeat the ARIA warning on later updates', () => {
  const {definition, target, warnings} = ariaComponent('aria-expanded')
  const mounted = definition.mount(target)

  mounted.update({value: true})
  mounted.update({value: false})
  mounted.update({value: true})
  mounted.update({value: true})

  assert.equal(warnings.length, 1)
  assert.equal(
    mounted.root.querySelector('button')?.getAttribute('aria-expanded'),
    '',
  )
})

test('warns again for a second mounted declaration', () => {
  const {definition, target, warnings} = ariaComponent('aria-expanded')
  const first = definition.mount(target)
  first.update({value: true})
  first.unmount()

  const second = definition.mount(target)
  second.update({value: true})

  assert.equal(warnings.length, 2)
  assert.match(warnings[1] ?? '', warningPattern)
})

test('keeps the documented attribute values for ARIA names', () => {
  const {definition, target, warnings} = ariaComponent('aria-expanded')
  const mounted = definition.mount(target)
  const button = () => mounted.root.querySelector('button')

  mounted.update({value: false})
  assert.equal(button()?.hasAttribute('aria-expanded'), false)

  mounted.update({value: 'true'})
  assert.equal(button()?.getAttribute('aria-expanded'), 'true')

  mounted.update({value: 'false'})
  assert.equal(button()?.getAttribute('aria-expanded'), 'false')

  mounted.update({value: 0})
  assert.equal(button()?.getAttribute('aria-expanded'), '0')

  mounted.update({value: 3})
  assert.equal(button()?.getAttribute('aria-expanded'), '3')

  mounted.update({value: null})
  assert.equal(button()?.getAttribute('aria-expanded'), '3')

  assert.deepEqual(warnings, [])

  mounted.update({value: true})
  assert.equal(button()?.getAttribute('aria-expanded'), '')
  assert.equal(warnings.length, 1)
})

test('does not warn for true on a non-ARIA attribute', () => {
  for (const name of ['disabled', 'hidden', 'data-aria-state', 'aria']) {
    const {definition, target, warnings} = ariaComponent(name)
    const mounted = definition.mount(target)

    mounted.update({value: true})

    assert.deepEqual(warnings, [], name)
    assert.equal(
      mounted.root.querySelector('button')?.getAttribute(name),
      '',
      name,
    )
  }
})

test('matches ARIA names without regard to case', () => {
  for (const name of ['ARIA-EXPANDED', 'Aria-Expanded']) {
    const {definition, target, warnings} = ariaComponent(name)
    const mounted = definition.mount(target)

    mounted.update({value: true})
    mounted.update({value: true})

    assert.equal(warnings.length, 1, name)
    assert.match(warnings[0] ?? '', new RegExp(`gave true for "${name}"`))
    assert.equal(
      mounted.root.querySelector('button')?.getAttribute('aria-expanded'),
      '',
      name,
    )
  }
})

test('warns once inside a repeat for every occurrence', () => {
  const {window, template, warnings} = setup(
    '<ul><li><button>Item</button></li></ul>',
  )
  /** @type {import('../src/index.js').Component<Data>} */
  const definition = component({
    source: template,
    bindings: [
      repeat('li', ({data}) => data.items, [
        attr('button', 'aria-pressed', ({item}) => /** @type {any} */ (item)),
      ]),
      attr('ul', 'aria-busy', ({data}) => data.value),
    ],
  })
  const mounted = definition.mount(window.document.createElement('div'))

  mounted.update({value: true, items: [true, true, 'false']})
  mounted.update({value: true, items: [true, true, true, true]})

  const pressed = Array.from(
    mounted.root.querySelectorAll('button'),
    button => button.getAttribute('aria-pressed'),
  )
  assert.deepEqual(pressed, ['', '', '', ''])
  assert.equal(mounted.root.getAttribute('aria-busy'), '')
  assert.equal(warnings.length, 2)
  assert.ok(warnings.some(msg => {
    return /attribute "button": the projection gave true for "aria-pressed"/
      .test(msg)
  }))
  assert.ok(warnings.some(msg => {
    return /attribute "ul": the projection gave true for "aria-busy"/.test(msg)
  }))
})
