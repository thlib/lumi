// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  attribute,
  child,
  classToggle,
  component,
  on,
  property,
  repeat,
  style,
  text,
} from '../src/index.js'

/**
 * @returns {{ document: Document, window: import('jsdom').DOMWindow }}
 */
function createDocument() {
  const { window } = new JSDOM()
  return { document: window.document, window }
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

test('renders scalar bindings into persistent native DOM', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section class="counter idle">
      <output class="value">0</output>
      <button class="increment" type="button">Increment</button>
    </section>
  `)

  /**
   * @typedef {{
   *   count: number,
   *   isActive: boolean,
   *   maximum: number,
   *   tone: string
   * }} CounterData
   */

  /** @type {import('../src/index.js').ComponentOptions<CounterData>} */
  const options = {
    template,
    bindings: [
      text('.value', data => data.count),
      property(
        '.increment',
        'disabled',
        data => data.count >= data.maximum,
      ),
      attribute('.counter', 'aria-busy', data => String(data.isActive)),
      classToggle('.counter', 'active', data => data.isActive),
      style('.counter', 'color', data => data.tone),
    ],
  }

  const target = document.createElement('div')
  const mounted = component(options).mount(target)
  const root = mounted.root
  const output = /** @type {HTMLOutputElement} */ (
    root.querySelector('.value')
  )
  const button = /** @type {HTMLButtonElement} */ (
    root.querySelector('.increment')
  )

  mounted.render({
    count: 2,
    isActive: true,
    maximum: 3,
    tone: 'rebeccapurple',
  })

  assert.equal(output.textContent, '2')
  assert.equal(button.disabled, false)
  assert.equal(root.getAttribute('aria-busy'), 'true')
  assert.equal(root.classList.contains('idle'), true)
  assert.equal(root.classList.contains('active'), true)
  assert.equal(/** @type {HTMLElement} */ (root).style.color, 'rebeccapurple')

  mounted.render({
    count: 3,
    isActive: false,
    maximum: 3,
    tone: '',
  })

  assert.strictEqual(mounted.root, root)
  assert.equal(output.textContent, '3')
  assert.equal(button.disabled, true)
  assert.equal(root.getAttribute('aria-busy'), 'false')
  assert.equal(root.classList.contains('active'), false)
  assert.equal(/** @type {HTMLElement} */ (root).style.color, '')
})

test('does not write an unchanged projected property', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<button type="button">Probe</button>',
  )
  /** @type {import('../src/index.js').ComponentOptions<{ value: number }>} */
  const options = {
    template,
    bindings: [
      property('button', 'lumiProbe', data => data.value),
    ],
  }
  const target = document.createElement('div')
  const mounted = component(options).mount(target)
  let storedValue = '0'
  let writeCount = 0

  Object.defineProperty(mounted.root, 'lumiProbe', {
    configurable: true,
    get() {
      return storedValue
    },
    set(value) {
      storedValue = String(value)
      writeCount += 1
    },
  })

  mounted.render({ value: 1 })
  mounted.render({ value: 1 })
  mounted.render({ value: 2 })

  assert.equal(storedValue, '2')
  assert.equal(writeCount, 2)
})

test('restores a bound property after the browser changes it', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<input type="text">')
  /** @type {import('../src/index.js').ComponentOptions<{ value: string }>} */
  const options = {
    template,
    bindings: [property('input', 'value', data => data.value)],
  }
  const target = document.createElement('div')
  const mounted = component(options).mount(target)
  const input = /** @type {HTMLInputElement} */ (mounted.root)

  mounted.render({ value: 'authoritative' })
  input.value = 'user edit'
  mounted.render({ value: 'authoritative' })

  assert.equal(input.value, 'authoritative')
})

test('native listeners are stable, read current data, and clean up', () => {
  const { document, window } = createDocument()
  const template = createTemplate(
    document,
    '<button class="increment" type="button">Increment</button>',
  )
  /** @type {Array<number>} */
  const observedCounts = []

  /** @type {import('../src/index.js').ComponentOptions<{ count: number }>} */
  const options = {
    template,
    events: [
      on('.increment', 'click', ({ data }) => {
        observedCounts.push(data.count)
      }),
    ],
  }

  const target = document.createElement('div')
  const mounted = component(options).mount(target)
  const button = /** @type {HTMLButtonElement} */ (mounted.root)

  button.dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.deepEqual(observedCounts, [])

  mounted.render({ count: 1 })
  mounted.render({ count: 2 })
  button.dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.deepEqual(observedCounts, [2])

  mounted.unmount()
  button.dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.deepEqual(observedCounts, [2])
  assert.equal(target.childElementCount, 0)
})

test('adopts an existing component root without replacing it', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<p class="message">Server content</p>',
  )
  const root = document.createElement('p')
  root.className = 'message'
  root.textContent = 'Server content'

  /** @type {import('../src/index.js').ComponentOptions<{ message: string }>} */
  const options = {
    template,
    bindings: [text('.message', data => data.message)],
  }

  const mounted = component(options).adopt(root)
  mounted.render({ message: 'Server content' })

  assert.strictEqual(mounted.root, root)
  assert.equal(root.textContent, 'Server content')

  mounted.render({ message: 'Client content' })
  assert.equal(root.textContent, 'Client content')
})

test('projects parent data into a persistent child component', () => {
  const { document } = createDocument()
  const childTemplate = createTemplate(
    document,
    '<strong class="name">Unknown</strong>',
  )

  /** @type {import('../src/index.js').ComponentOptions<{ name: string }>} */
  const childOptions = {
    template: childTemplate,
    bindings: [text('.name', data => data.name)],
  }
  const childComponent = component(childOptions)
  const parentTemplate = createTemplate(
    document,
    '<section><div class="child"></div></section>',
  )

  /**
   * @typedef {{ profile: { name: string } }} ParentData
   */

  /** @type {import('../src/index.js').ComponentOptions<ParentData>} */
  const parentOptions = {
    template: parentTemplate,
    bindings: [
      child('.child', childComponent, data => data.profile),
    ],
  }
  const target = document.createElement('div')
  const mounted = component(parentOptions).mount(target)

  mounted.render({ profile: { name: 'Ada' } })
  const childRoot = mounted.root.querySelector('.name')
  assert.equal(childRoot?.textContent, 'Ada')

  mounted.render({ profile: { name: 'Grace' } })
  assert.strictEqual(mounted.root.querySelector('.name'), childRoot)
  assert.equal(childRoot?.textContent, 'Grace')
})

test('reconciles keyed children while preserving identity and order', () => {
  const { document } = createDocument()
  const itemTemplate = createTemplate(
    document,
    '<li><span class="label"></span></li>',
  )

  /** @typedef {{ id: string, label: string }} Item */
  /** @type {import('../src/index.js').ComponentOptions<Item>} */
  const itemOptions = {
    template: itemTemplate,
    bindings: [text('.label', item => item.label)],
  }
  const listTemplate = createTemplate(
    document,
    '<ul class="items"></ul>',
  )

  /** @type {import('../src/index.js').ComponentOptions<{ items: Item[] }>} */
  const listOptions = {
    template: listTemplate,
    bindings: [
      repeat('.items', {
        items: data => data.items,
        key: item => item.id,
        component: component(itemOptions),
      }),
    ],
  }

  const target = document.createElement('div')
  const mounted = component(listOptions).mount(target)
  mounted.render({
    items: [
      { id: 'a', label: 'Ada' },
      { id: 'g', label: 'Grace' },
    ],
  })

  const ada = mounted.root.children[0]
  const grace = mounted.root.children[1]

  mounted.render({
    items: [
      { id: 'g', label: 'Grace Hopper' },
      { id: 'a', label: 'Ada Lovelace' },
    ],
  })

  assert.strictEqual(mounted.root.children[0], grace)
  assert.strictEqual(mounted.root.children[1], ada)
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.label'), element => {
      return element.textContent
    }),
    ['Grace Hopper', 'Ada Lovelace'],
  )

  mounted.render({
    items: [{ id: 'g', label: 'Grace Hopper' }],
  })
  assert.equal(mounted.root.childElementCount, 1)
  assert.strictEqual(mounted.root.children[0], grace)
  assert.equal(ada?.isConnected, false)
})

test('minimizes DOM moves when keyed children rotate', () => {
  const { document } = createDocument()
  const itemTemplate = createTemplate(document, '<li></li>')
  /** @type {import('../src/index.js').ComponentOptions<{ id: string }>} */
  const itemOptions = { template: itemTemplate }
  const listTemplate = createTemplate(document, '<ul></ul>')
  /** @type {import('../src/index.js').ComponentOptions<{
   *   items: Array<{ id: string }>
   * }>} */
  const listOptions = {
    template: listTemplate,
    bindings: [
      repeat('ul', {
        items: data => data.items,
        key: item => item.id,
        component: component(itemOptions),
      }),
    ],
  }
  const target = document.createElement('div')
  const mounted = component(listOptions).mount(target)
  const container = mounted.root

  mounted.render({
    items: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id })),
  })

  const initialRoots = Array.from(container.children)
  const insertBefore = container.insertBefore
  let moveCount = 0

  /**
   * @template {Node} NodeType
   * @param {NodeType} node
   * @param {Node | null} child
   * @returns {NodeType}
   */
  function countInsertBefore(node, child) {
    moveCount += 1
    return /** @type {NodeType} */ (
      insertBefore.call(container, node, child)
    )
  }

  Object.defineProperties(container, {
    insertBefore: {
      configurable: true,
      value: countInsertBefore,
    },
    moveBefore: {
      configurable: true,
      value: undefined,
    },
  })

  mounted.render({
    items: ['c', 'd', 'e', 'a', 'b'].map(id => ({ id })),
  })

  assert.equal(moveCount, 2)
  assert.strictEqual(container.children[0], initialRoots[2])
  assert.strictEqual(container.children[1], initialRoots[3])
  assert.strictEqual(container.children[2], initialRoots[4])
  assert.strictEqual(container.children[3], initialRoots[0])
  assert.strictEqual(container.children[4], initialRoots[1])
})

test('prefers native state-preserving moves when available', () => {
  const { document } = createDocument()
  const itemTemplate = createTemplate(
    document,
    '<li><span class="key"></span></li>',
  )
  /** @type {import('../src/index.js').ComponentOptions<{ id: string }>} */
  const itemOptions = {
    template: itemTemplate,
    bindings: [text('.key', item => item.id)],
  }
  const listTemplate = createTemplate(document, '<ul></ul>')
  /** @type {import('../src/index.js').ComponentOptions<{
   *   items: Array<{ id: string }>
   * }>} */
  const listOptions = {
    template: listTemplate,
    bindings: [
      repeat('ul', {
        items: data => data.items,
        key: item => item.id,
        component: component(itemOptions),
      }),
    ],
  }
  const target = document.createElement('div')
  const mounted = component(listOptions).mount(target)
  const container = mounted.root

  mounted.render({ items: [{ id: 'a' }, { id: 'b' }] })

  const insertBefore = container.insertBefore
  let atomicMoveCount = 0

  /**
   * @param {Node} node
   * @param {Node | null} child
   */
  function moveBefore(node, child) {
    atomicMoveCount += 1
    insertBefore.call(container, node, child)
  }

  Object.defineProperty(container, 'moveBefore', {
    configurable: true,
    value: moveBefore,
  })

  mounted.render({ items: [{ id: 'b' }, { id: 'a' }] })

  assert.equal(atomicMoveCount, 1)
  assert.deepEqual(
    Array.from(container.querySelectorAll('.key'), element => {
      return element.textContent
    }),
    ['b', 'a'],
  )
})

test('keeps raw HTML and native handlers out of generic bindings', () => {
  assert.throws(
    () => property('p', 'innerHTML', () => '<strong>unsafe</strong>'),
    /trusted-content API/,
  )
  assert.throws(
    () => property('button', 'onclick', () => () => {}),
    /use on\(\)/,
  )
  assert.throws(
    () => attribute('button', 'onclick', () => 'run()'),
    /use on\(\)/,
  )
  assert.throws(
    () => attribute('iframe', 'srcdoc', () => '<script>run()</script>'),
    /trusted-content API/,
  )
})

test('rejects invalid templates, missing targets, duplicate keys, and stale renders', () => {
  const { document } = createDocument()
  const invalidTemplate = createTemplate(
    document,
    '<p>First</p><p>Second</p>',
  )
  const target = document.createElement('div')

  assert.throws(
    () => component({ template: invalidTemplate }).mount(target),
    /exactly one root element/,
  )

  const missingTargetTemplate = createTemplate(document, '<p>Text</p>')
  assert.throws(
    () => component({
      template: missingTargetTemplate,
      bindings: [text('.missing', () => 'value')],
    }).mount(target),
    /did not match/,
  )

  /** @typedef {{ id: string }} Item */
  const itemTemplate = createTemplate(document, '<li></li>')
  /** @type {import('../src/index.js').ComponentOptions<Item>} */
  const itemOptions = { template: itemTemplate }
  const listTemplate = createTemplate(document, '<ul></ul>')
  /** @type {import('../src/index.js').ComponentOptions<{ items: Item[] }>} */
  const listOptions = {
    template: listTemplate,
    bindings: [
      repeat('ul', {
        items: data => data.items,
        key: item => item.id,
        component: component(itemOptions),
      }),
    ],
  }
  const list = component(listOptions).mount(target)

  assert.throws(
    () => list.render({ items: [{ id: 'same' }, { id: 'same' }] }),
    /duplicate key "same"/,
  )
  assert.equal(list.root.childElementCount, 0)

  list.unmount()
  assert.throws(
    () => list.render({ items: [] }),
    /unmounted/,
  )
})
