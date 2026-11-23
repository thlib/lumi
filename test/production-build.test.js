// @ts-check

// These tests use the two builds in dist/. `pnpm test` makes the builds
// before it runs the tests.

import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {installMoveBefore} from '../src/shims/move-before.js'

const production = /** @type {typeof import('../src/index.js')} */ (
  await import(String('../dist/lumi.js'))
)
const development = /** @type {typeof import('../src/index.js')} */ (
  await import(String('../dist/lumi.dev.js'))
)
const productionText = readFileSync(
  new URL('../dist/lumi.js', import.meta.url),
  'utf8',
)
const developmentText = readFileSync(
  new URL('../dist/lumi.dev.js', import.meta.url),
  'utf8',
)

/**
 * @param {string} markup
 */
function createSource(markup) {
  const {window} = new JSDOM()
  installMoveBefore(window)
  const {document} = window
  const template = document.createElement('template')
  template.innerHTML = markup
  /** @type {string[]} */
  const warnings = []
  const record = (/** @type {unknown[]} */ ...args) => {
    warnings.push(args.map(String).join(' '))
  }

  window.console.warn = record
  return {document, template, warnings, record}
}

/**
 * Runs an operation and records the warnings of the global console.
 *
 * @param {(...args: unknown[]) => void} record
 * @param {() => void} operation
 */
function withGlobalWarnings(record, operation) {
  const original = console.warn

  console.warn = record

  try {
    operation()
  } finally {
    console.warn = original
  }
}

/**
 * @param {() => unknown} operation
 * @returns {string}
 */
function messageOf(operation) {
  try {
    operation()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ''
}

test('the production build has no message texts and no warnings', () => {
  assert.equal(productionText.includes('console'), false)
  assert.equal(productionText.includes('matches the component root'), false)
  assert.equal(productionText.includes('usually does not bubble'), false)
  assert.equal(developmentText.includes('matches the component root'), true)
  assert.equal(developmentText.includes('usually does not bubble'), true)
  assert.ok(productionText.length < developmentText.length)
})

test('the two builds have the same exports', () => {
  assert.deepEqual(Object.keys(production).sort(), Object.keys(development).sort())
})

test('the production build gives an error code with the details', () => {
  const {document, template} = createSource('<output></output>')
  /**
   * @param {typeof import('../src/index.js')} lumi
   */
  const repeatRoot = lumi => messageOf(() => {
    lumi.component({
      source: template,
      bindings: [lumi.repeat('output', () => [])],
    }).mount(document.createElement('div'))
  })

  assert.equal(repeatRoot(production), 'Lumi E5 output')
  assert.equal(
    repeatRoot(development),
    'Lumi E5: repeat "output" matches the component root. A repeat must '
    + 'match a descendant.',
  )
  assert.equal(
    messageOf(() => production.attr('button', 'onclick', () => '')),
    'Lumi E1 attribute onclick',
  )
  assert.equal(
    messageOf(() => production.prop('iframe', 'srcdoc', () => '')),
    'Lumi E2 property srcdoc',
  )

  const mounted = production.component({
    source: template,
    bindings: [production.prop('output', 'innerHTML', ({data}) => data)],
  }).mount(document.createElement('div'))

  // jsdom has no Trusted Types API.
  assert.equal(messageOf(() => mounted.update('<b>Text</b>')), 'Lumi E3 innerHTML')
  assert.equal(mounted.root.innerHTML, '')
})

test('the production build gives error E13 for an update in an update', () => {
  const {document, template} = createSource('<p></p>')
  /** @type {import('../src/index.js').MountedComponent<string> | undefined} */
  let mounted
  let nested = ''

  mounted = production.component({
    source: template,
    bindings: [
      production.text('p', ({data}) => {
        nested ||= messageOf(() => mounted?.update('nested'))
        return /** @type {string} */ (data)
      }),
    ],
  }).mount(document.body)
  mounted.update('outer')

  assert.equal(nested, 'Lumi E13')
  assert.equal(mounted.root.textContent, 'outer')
})

test('the production build gives no warning where the development build gives one', () => {
  for (const [lumi, count] of /** @type {const} */ ([
    [production, 0],
    [development, 7],
  ])) {
    const {document, template, warnings, record} = createSource(
      '<section><p class="label">Default</p><button>Menu</button>'
      + '<i class="extra"></i></section>',
    )

    withGlobalWarnings(record, () => {
      const mounted = lumi.component({
        source: template,
        bindings: [
          // A value that is not text keeps the DOM state.
          lumi.text('.label', ({data}) => /** @type {any} */ (data).label),
          // The value true for an ARIA attribute.
          lumi.attr('button', 'aria-expanded', () => /** @type {any} */ (true)),
          // A repeat that matches no element.
          lumi.repeat('.missing', () => []),
          // A third argument that is not valid.
          lumi.repeat('.extra', () => null, /** @type {never} */ (1)),
          // A child that matches no element.
          lumi.child('.absent', lumi.component({source: template}), ({data}) => data),
          // An option that is not known, and an event that does not bubble.
          lumi.on('button', 'click', () => {}, /** @type {never} */ ({once: true})),
          lumi.on('button', 'focus', () => {}),
        ],
      }).mount(document.createElement('div'))

      mounted.update({label: ['not text']})

      // The two builds give the same DOM.
      assert.equal(
        mounted.root.outerHTML,
        '<section><p class="label">Default</p>'
        + '<button aria-expanded="">Menu</button>'
        + '<i class="extra"></i><!--lumi--></section>',
      )
    })

    assert.equal(warnings.length, count, warnings.join('\n'))
  }
})

test('the production build gives the error of the browser for an invalid source', () => {
  const {document} = createSource('<p></p>')
  const target = document.createElement('div')

  target.innerHTML = '<p>Before</p>'

  assert.throws(
    () => production.component({source: null}).mount(target),
    TypeError,
  )
  assert.equal(target.innerHTML, '<p>Before</p>')
  assert.throws(
    () => development.component({source: null}).mount(target),
    /^Error: Lumi E21: /,
  )
  assert.equal(target.innerHTML, '<p>Before</p>')
})

test('the production build renders duplicate keys and ignores lost targets', () => {
  const {document, template} = createSource(
    '<ul><li class="row"><b class="name"></b><i class="role"></i></li></ul>',
  )
  /** @typedef {{id: number, name: string, role: string}} Person */
  const mounted = production.component({
    source: template,
    bindings: [
      production.repeat(
        '.row',
        ({data}) => /** @type {Person[]} */ (data),
        ({item}) => item.id,
        [
          production.text('.name', ({item}) => item.name),
          production.text('.role', ({item}) => item.role),
        ],
      ),
    ],
  }).mount(document.body)
  const names = () => Array.from(
    mounted.root.querySelectorAll('.name'),
    element => element.textContent,
  )

  mounted.update([
    {id: 1, name: 'Ada', role: 'a'},
    {id: 1, name: 'Grace', role: 'b'},
    {id: 2, name: 'Edsger', role: 'c'},
  ])
  assert.deepEqual(names(), ['Ada', 'Grace', 'Edsger'])

  for (const role of mounted.root.querySelectorAll('.role')) {
    role.remove()
  }

  mounted.update([
    {id: 2, name: 'Edsger D.', role: 'd'},
    {id: 1, name: 'Ada L.', role: 'e'},
  ])
  assert.deepEqual(names(), ['Edsger D.', 'Ada L.'])
  assert.equal(mounted.root.querySelectorAll('.row').length, 2)
})

test('the source maps of the two builds have the lines of the source files', () => {
  for (const name of ['lumi.js', 'lumi.dev.js']) {
    const map = JSON.parse(readFileSync(
      new URL(`../dist/${name}.map`, import.meta.url),
      'utf8',
    ))

    assert.ok(map.sources.length > 0)
    for (const [index, source] of map.sources.entries()) {
      const file = readFileSync(
        new URL(`../dist/${source}`, import.meta.url),
        'utf8',
      )

      assert.equal(
        map.sourcesContent[index].split('\n').length,
        file.split('\n').length,
        `${name}: ${source}`,
      )
    }
  }
})
