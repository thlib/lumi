// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { jsonPath } from '../examples/counter/plain.js'
import {
  attr,
  child,
  classToggle,
  component,
  event,
  prop,
  style,
  bind,
} from '../src/index.js'
import * as publicApi from '../src/index.js'

/**
 * @returns {{ document: Document, window: import('jsdom').DOMWindow }}
 */
function createDocument() {
  const { window } = new JSDOM()
  installTestTrustedTypes(window)
  return { document: window.document, window }
}

/**
 * jsdom does not implement Trusted Types. This test-only factory preserves
 * the API's nominal check: only values created by one of its policies pass
 * isHTML(), so ordinary objects and strings cannot impersonate TrustedHTML.
 *
 * @param {import('jsdom').DOMWindow} window
 */
function installTestTrustedTypes(window) {
  const trustedValues = new WeakSet()

  class TestTrustedHTML {
    /** @param {string} value */
    constructor(value) {
      this.value = value
      trustedValues.add(this)
      Object.freeze(this)
    }

    toString() {
      return this.value
    }

    toJSON() {
      return this.value
    }
  }

  Reflect.set(window, 'trustedTypes', {
    /** @param {unknown} value */
    isHTML(value) {
      return (
        typeof value === 'object'
        && value !== null
        && trustedValues.has(value)
      )
    },

    /**
     * @param {string} _name
     * @param {{createHTML: (value: string) => string}} options
     */
    createPolicy(_name, options) {
      return {
        /** @param {string} value */
        createHTML(value) {
          return new TestTrustedHTML(String(options.createHTML(value)))
        },
      }
    },
  })
}

/**
 * Creates test markup through the same policy boundary application code uses
 * in a browser.
 *
 * @param {Document} document
 * @param {string} markup
 * @returns {object}
 */
function trustedHTML(document, markup) {
  const factory = Reflect.get(document.defaultView ?? {}, 'trustedTypes')
  const createPolicy = Reflect.get(factory, 'createPolicy')
  const policy = Reflect.apply(createPolicy, factory, [
    'lumi-test',
    { createHTML: (/** @type {string} */ value) => value },
  ])
  return Reflect.apply(Reflect.get(policy, 'createHTML'), policy, [markup])
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
 * Test helper that creates a component and applies its initial snapshot.
 *
 * @template Data
 * @param {Data} data
 * @param {{
 *   target: Element | null,
 *   template: HTMLTemplateElement | null,
 *   bindings?: ReadonlyArray<import('../src/types.js').Binding<Data>>
 * }} options
 */
function render(data, options) {
  const mounted = component(options).mount(options.target)

  try {
    mounted.update(data)
    return mounted
  } catch (error) {
    mounted.unmount()
    throw error
  }
}

test('exposes only the APIs used by Lumi applications', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'attr',
    'bind',
    'child',
    'classToggle',
    'component',
    'event',
    'prop',
    'style',
  ])
})

test('delegates native events and removes handlers on unmount', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section>
      <button class="action" type="button"><span>Run</span></button>
    </section>
  `)
  /** @type {Array<[Event, Element]>} */
  const handled = []
  const target = document.createElement('div')
  const mounted = component({
    template,
    bindings: [
      event('.action', 'click', (nativeEvent, element) => {
        handled.push([nativeEvent, element])
      }),
    ],
  }).mount(target)
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('.action')
  )
  const label = /** @type {HTMLSpanElement} */ (button.firstElementChild)
  const click = new window.Event('click', {
    bubbles: true,
    composed: true,
  })

  label.dispatchEvent(click)

  assert.equal(handled.length, 1)
  assert.strictEqual(handled[0]?.[0], click)
  assert.strictEqual(handled[0]?.[1], button)

  mounted.unmount()
  label.dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(handled.length, 1)
})

test('event handlers follow elements repeated by bind', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul>
      <li class="item"><button type="button">Item</button></li>
    </ul>
  `)
  /** @type {Element[]} */
  const handled = []
  const target = document.createElement('div')
  const mounted = component({
    template,
    bindings: [
      bind('.item', data => data.items),
      event('.item button', 'click', (_nativeEvent, element) => {
        handled.push(element)
      }),
    ],
  }).mount(target)

  mounted.update({ items: [{}, {}] })

  const buttons = mounted.root.querySelectorAll('button')
  buttons[1]?.dispatchEvent(new window.Event('click', {
    bubbles: true,
    composed: true,
  }))

  assert.deepEqual(handled, [buttons[1]])
})

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
      bind('.value', data => data.count),
      prop(
        '.increment',
        data => data.count >= data.maximum,
        'disabled',
      ),
      attr('.counter', 'aria-busy', data => String(data.isActive)),
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

  mounted.update({
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

  mounted.update({
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

test('renders scalar bindings through open shadow roots', () => {
  const { document, window } = createDocument()

  class ShadowCounter extends window.HTMLElement {
    constructor() {
      super()
      const shadow = this.attachShadow({ mode: 'open' })
      shadow.innerHTML = `
        <section class="counter">
          <output class="value">Default</output>
        </section>
      `
    }
  }

  window.customElements.define('shadow-counter', ShadowCounter)
  const template = createTemplate(document, '<shadow-counter></shadow-counter>')
  const mounted = component({
    template,
    bindings: [
      prop(
        '.counter',
        () => trustedHTML(
          document,
          '<output class="value">Planned</output>',
        ),
        'innerHTML',
      ),
      bind('.value', data => data.count),
      attr('.value', 'title', data => data.title),
      classToggle('.value', 'active', data => data.active),
      style('.value', 'color', data => data.color),
    ],
  }).mount(document.body)

  mounted.update({
    count: 2,
    title: 'Current count',
    active: true,
    color: 'rebeccapurple',
  })

  const shadow = mounted.root.shadowRoot
  const output = /** @type {HTMLOutputElement | null} */ (
    shadow?.querySelector('.value') ?? null
  )

  assert.equal(output?.textContent, '2')
  assert.equal(output?.title, 'Current count')
  assert.equal(output?.classList.contains('active'), true)
  assert.equal(output?.style.color, 'rebeccapurple')

  mounted.update({
    count: 3,
    title: 'Updated',
    active: false,
    color: '',
  })

  assert.strictEqual(shadow?.querySelector('.value'), output)
  assert.equal(output?.textContent, '3')
  assert.equal(output?.title, 'Updated')
  assert.equal(output?.classList.contains('active'), false)
  assert.equal(output?.style.color, '')
})

test('repeats bind targets inside open shadow roots', () => {
  const { document, window } = createDocument()

  class ShadowList extends window.HTMLElement {
    constructor() {
      super()
      const shadow = this.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<ul><li class="item">Default</li></ul>'
    }
  }

  window.customElements.define('shadow-list', ShadowList)
  const mounted = render(
    /** @type {{ items: string[] }} */ ({ items: [] }),
    {
      target: document.body,
      template: createTemplate(document, '<shadow-list></shadow-list>'),
      bindings: [bind('.item', data => data.items)],
    },
  )
  const shadow = mounted.root.shadowRoot

  assert.equal(shadow?.querySelectorAll('.item').length, 0)

  mounted.update({ items: ['Ada', 'Grace'] })
  const items = shadow?.querySelectorAll('.item')
  const first = items?.[0]

  assert.deepEqual(
    Array.from(items ?? [], element => element.textContent),
    ['Ada', 'Grace'],
  )

  mounted.update({ items: ['Linus'] })

  assert.strictEqual(shadow?.querySelector('.item'), first)
  assert.equal(first?.textContent, 'Linus')
})

test('mounts child components into open shadow roots', () => {
  const { document, window } = createDocument()

  class ShadowHost extends window.HTMLElement {
    constructor() {
      super()
      const shadow = this.attachShadow({ mode: 'open' })
      shadow.innerHTML = `
        <div class="child-slot"></div>
        <output class="parent-value">Default</output>
      `
    }
  }

  class ShadowChild extends window.HTMLElement {
    constructor() {
      super()
      const shadow = this.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<output class="child-value">Default</output>'
    }
  }

  window.customElements.define('shadow-host', ShadowHost)
  window.customElements.define('shadow-child', ShadowChild)
  const childComponent = component({
    template: createTemplate(document, '<shadow-child></shadow-child>'),
    bindings: [bind('.child-value', data => data)],
  })
  const mounted = component({
    template: createTemplate(document, '<shadow-host></shadow-host>'),
    bindings: [
      child('.child-slot', childComponent, data => data.child),
      bind('.parent-value', data => data.parent),
      bind('.child-value', () => 'Parent must not reach this'),
    ],
  }).mount(document.body)

  mounted.update({ parent: 'Parent', child: 'Child' })

  assert.equal(
    mounted.root.shadowRoot?.querySelector('.parent-value')?.textContent,
    'Parent',
  )
  assert.equal(
    mounted.root.shadowRoot
      ?.querySelector('shadow-child')
      ?.shadowRoot
      ?.querySelector('.child-value')
      ?.textContent,
    'Child',
  )
})

test('passes the planned matching element to scalar projections', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<output data-field="count">0</output>',
  )
  const mounted = render({ count: 2 }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('output', (data, element) => {
        return `${element.getAttribute('data-field')}: ${data.count}`
      }),
    ],
  })

  assert.equal(mounted.root.textContent, 'count: 2')
})

test('repeats bind targets for array projection values', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<ul><li class="item">Default</li></ul>',
  )
  let projectionCount = 0
  const mounted = render(
    /** @type {{ items: string[] }} */ ({ items: [] }),
    {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.item', data => {
        projectionCount += 1
        return data.items
      }),
    ],
    },
  )

  assert.equal(projectionCount, 1)
  assert.equal(mounted.root.querySelectorAll('.item').length, 0)

  mounted.update({ items: ['Ada', 'Grace'] })
  const ada = mounted.root.querySelectorAll('.item')[0]
  const grace = mounted.root.querySelectorAll('.item')[1]

  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    ),
    ['Ada', 'Grace'],
  )

  mounted.update({ items: ['Grace', 'Ada', 'Linus'] })

  assert.strictEqual(mounted.root.querySelectorAll('.item')[0], ada)
  assert.strictEqual(mounted.root.querySelectorAll('.item')[1], grace)
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    ),
    ['Grace', 'Ada', 'Linus'],
  )

  mounted.update({ items: /** @type {never} */ (null) })
  assert.strictEqual(mounted.root.querySelectorAll('.item')[0], ada)
  assert.strictEqual(mounted.root.querySelectorAll('.item')[1], grace)
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    ),
    ['Grace', 'Ada', 'Linus'],
  )

  mounted.update({ items: [] })
  assert.equal(mounted.root.querySelectorAll('.item').length, 0)
  assert.equal(ada?.isConnected, false)
})

test('evaluates each projection once when an array promotes planning', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output class="before">Default</output>
      <p class="item">Default</p>
      <button class="after" type="button">Action</button>
    </section>
  `)
  const calls = {
    before: 0,
    items: 0,
    after: 0,
  }
  const mounted = component({
    template,
    bindings: [
      bind('.before', data => {
        calls.before += 1
        return data.before
      }),
      bind('.item', data => {
        calls.items += 1
        return data.items
      }),
      attr('.after', 'title', data => {
        calls.after += 1
        return data.after
      }),
    ],
  }).mount(document.createElement('div'))

  mounted.update({
    before: 'Before',
    items: ['First', 'Second'],
    after: 'After',
  })

  assert.deepEqual(calls, {
    before: 1,
    items: 1,
    after: 1,
  })
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    ),
    ['First', 'Second'],
  )
  assert.equal(
    mounted.root.querySelector('.after')?.getAttribute('title'),
    'After',
  )

  mounted.update({
    before: 'Updated',
    items: 'One item',
    after: 'Updated title',
  })

  assert.deepEqual(calls, {
    before: 2,
    items: 2,
    after: 2,
  })
  assert.equal(mounted.root.querySelectorAll('.item').length, 1)
  assert.equal(
    mounted.root.querySelector('.item')?.textContent,
    'One item',
  )
})

test('keeps failed cardinality promotion recoverable', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <p class="item">Default</p>
      <button type="button">Action</button>
    </section>
  `)
  let itemProjectionCount = 0
  let titleProjectionCount = 0
  const mounted = component({
    template,
    bindings: [
      bind('.item', data => {
        itemProjectionCount += 1
        return data.items
      }),
      attr('button', 'title', data => {
        titleProjectionCount += 1
        return data.title
      }),
    ],
  }).mount(document.createElement('div'))
  const item = mounted.root.querySelector('.item')

  assert.throws(
    () => mounted.update({
      items: ['Rejected'],
      title: /** @type {never} */ ({ invalid: true }),
    }),
    /attribute projection/,
  )
  assert.equal(itemProjectionCount, 1)
  assert.equal(titleProjectionCount, 1)
  assert.strictEqual(mounted.root.querySelector('.item'), item)
  assert.equal(item?.textContent, 'Default')

  mounted.update({
    items: ['First', 'Second'],
    title: 'Ready',
  })

  assert.equal(itemProjectionCount, 2)
  assert.equal(titleProjectionCount, 2)
  assert.strictEqual(mounted.root.querySelector('.item'), item)
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    ),
    ['First', 'Second'],
  )
})

test('keeps ordinary array updates on the static cardinality path', () => {
  const { document, window } = createDocument()
  const template = createTemplate(
    document,
    '<ul><li class="item">Default</li></ul>',
  )
  const mounted = component({
    template,
    bindings: [bind('.item', data => data.items)],
  }).mount(document.createElement('div'))
  const originalCloneNode = window.Node.prototype.cloneNode
  let cloneCount = 0

  window.Node.prototype.cloneNode = function cloneNode(deep) {
    cloneCount += 1
    return originalCloneNode.call(this, deep)
  }

  try {
    mounted.update({ items: ['First', 'Second'] })
    mounted.update({ items: ['Updated first', 'Updated second'] })
  } finally {
    window.Node.prototype.cloneNode = originalCloneNode
  }

  assert.equal(cloneCount, 0)
})

test('expands nested arrays through nested bind targets', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <main>
      <section class="group">
        <span class="name">Default name</span>
        <small class="shared">Default shared value</small>
      </section>
    </main>
  `)
  const mounted = render(
    /** @type {{
     *   groups: string[][],
     *   hidden: boolean[][],
     *   shared: string
     * }} */ ({
      groups: [],
      hidden: [],
      shared: 'Shared',
    }),
    {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.group', data => data.groups),
      bind('.name', data => data.groups),
      bind('.shared', data => data.shared),
      prop('.name', data => data.hidden, 'hidden'),
    ],
    },
  )

  mounted.update({
    groups: [
      ['Ada', 'Grace'],
      ['Linus'],
    ],
    hidden: [
      [false, true],
      [false],
    ],
    shared: 'Shared',
  })

  const groups = mounted.root.querySelectorAll('.group')
  const names = mounted.root.querySelectorAll('.name')

  assert.equal(groups.length, 2)
  assert.deepEqual(
    Array.from(names, element => element.textContent),
    ['Ada', 'Grace', 'Linus'],
  )
  assert.deepEqual(
    Array.from(names, element => {
      return /** @type {HTMLElement} */ (element).hidden
    }),
    [false, true, false],
  )
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.shared'),
      element => element.textContent,
    ),
    ['Shared', 'Shared'],
  )

  const firstGroup = groups[0]
  const firstName = names[0]

  mounted.update({
    groups: [
      ['ADA'],
      [],
      ['Katherine', 'Margaret'],
    ],
    hidden: [
      [false],
      [],
      [true, false],
    ],
    shared: 'Still shared',
  })

  assert.strictEqual(mounted.root.querySelectorAll('.group')[0], firstGroup)
  assert.strictEqual(mounted.root.querySelectorAll('.name')[0], firstName)
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.name'),
      element => element.textContent,
    ),
    ['ADA', 'Katherine', 'Margaret'],
  )
  assert.equal(
    mounted.root.querySelectorAll('.group')[1]
      ?.querySelectorAll('.name').length,
    0,
  )
})

test('validates complete array coordinates before changing live DOM', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <main>
      <section class="group">
        <span class="name">Default</span>
      </section>
    </main>
  `)
  const mounted = render({
    groups: [['Ada'], ['Grace']],
    hidden: [[false], [true]],
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.group', data => data.groups),
      bind('.name', data => data.groups),
      prop('.name', data => data.hidden, 'hidden'),
    ],
  })
  const before = mounted.root.innerHTML
  const firstGroup = mounted.root.querySelector('.group')

  assert.throws(
    () => mounted.update({
      groups: [['Rejected'], ['Missing flag']],
      hidden: [[false]],
    }),
    /does not contain array coordinate \[1, 0\]/,
  )
  assert.equal(mounted.root.innerHTML, before)
  assert.strictEqual(mounted.root.querySelector('.group'), firstGroup)

  mounted.update({
    groups: [['After']],
    hidden: [[false]],
  })
  assert.equal(mounted.root.querySelector('.name')?.textContent, 'After')
})

test('rejects array cardinality at the mounted component root', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<output>Default</output>',
  )
  const mounted = component({
    template,
    bindings: [bind('output', data => data.value)],
  }).mount(document.createElement('div'))

  assert.throws(
    () => mounted.update({ value: ['One', 'Two'] }),
    /cannot apply array cardinality at a mounted component root/,
  )
  assert.equal(mounted.root.textContent, 'Default')

  mounted.update({ value: 'Scalar retry' })
  assert.equal(mounted.root.textContent, 'Scalar retry')
})

test('applies scalar bindings to every initial selector match', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section class="state" data-key="first">
      <span class="copy" data-key="first"></span>
      <span class="copy" data-key="second"></span>
      <div class="markup" data-key="first"></div>
      <div class="markup" data-key="second"></div>
      <button class="state" data-key="second" type="button"></button>
    </section>
  `)

  /**
   * @typedef {{
   *   text: string,
   *   markup: string,
   *   value: number,
   *   title: string,
   *   active: boolean,
   *   color: string
   * }} ScalarData
   */

  /**
   * @typedef {{
   *   first: ScalarData,
   *   second: ScalarData
   * }} PresentationData
   */

  /**
   * @param {PresentationData} data
   * @param {Element} element
   * @returns {ScalarData}
   */
  function dataFor(data, element) {
    const key = element.getAttribute('data-key')

    if (key !== 'first' && key !== 'second') {
      throw new Error('Expected scalar binding data key')
    }

    return data[key]
  }

  const mounted = render({
    first: {
      text: 'First',
      markup: '<strong>First</strong>',
      value: 1,
      title: 'First title',
      active: true,
      color: 'red',
    },
    second: {
      text: 'Second',
      markup: '<strong>Second</strong>',
      value: 2,
      title: 'Second title',
      active: false,
      color: 'blue',
    },
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.copy', (data, element) => dataFor(data, element).text),
      prop(
        '.markup',
        (data, element) => {
          return trustedHTML(document, dataFor(data, element).markup)
        },
        'innerHTML',
      ),
      prop('.state', (data, element) => dataFor(data, element).value, 'lumiValue'),
      attr('.state', 'title', (data, element) => dataFor(data, element).title),
      classToggle(
        '.state',
        'active',
        (data, element) => dataFor(data, element).active,
      ),
      style('.state', 'color', (data, element) => dataFor(data, element).color),
    ],
  })

  const copy = mounted.root.querySelectorAll('.copy')
  const markup = mounted.root.querySelectorAll('.markup')
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('button')
  )

  assert.deepEqual(
    Array.from(copy, element => element.textContent),
    ['First', 'Second'],
  )
  assert.deepEqual(
    Array.from(markup, element => element.innerHTML),
    ['<strong>First</strong>', '<strong>Second</strong>'],
  )
  assert.equal(Reflect.get(mounted.root, 'lumiValue'), 1)
  assert.equal(Reflect.get(button, 'lumiValue'), 2)
  assert.equal(
    /** @type {HTMLElement} */ (mounted.root).title,
    'First title',
  )
  assert.equal(button.title, 'Second title')
  assert.equal(mounted.root.classList.contains('active'), true)
  assert.equal(button.classList.contains('active'), false)
  assert.equal(/** @type {HTMLElement} */ (mounted.root).style.color, 'red')
  assert.equal(button.style.color, 'blue')
})

test('resolves descendant bindings after parent structure regardless of declaration order', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <article class="person"></article>
  `)
  let projectedElement
  const mounted = render({
    markup: '<span class="name" data-format="created">Base</span>',
    name: 'Ada Lovelace',
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.person .name', (data, element) => {
        projectedElement = element
        return `${element.getAttribute('data-format')}: ${data.name}`
      }),
      prop(
        '.person',
        data => trustedHTML(document, data.markup),
        'innerHTML',
      ),
    ],
  })

  const name = mounted.root.querySelector('.name')

  assert.equal(name?.textContent, 'created: Ada Lovelace')
  assert.notStrictEqual(projectedElement, name)

  mounted.update({
    markup: `
      <span class="name" data-format="first"></span>
      <span class="name" data-format="second"></span>
    `,
    name: 'Grace Hopper',
  })

  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.name'),
      element => element.textContent,
    ),
    ['first: Grace Hopper', 'second: Grace Hopper'],
  )
})

test('resolves structurally created bindings inside array occurrences', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <article class="item">
        <div class="host"></div>
      </article>
      <aside class="outside-host"></aside>
    </section>
  `)
  const mounted = render({
    items: [
      { label: 'First', format: 'strong' },
      { label: 'Second', format: 'em' },
    ],
    headline: 'Initial headline',
    fail: false,
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.late', data => {
        if (data.fail) {
          throw new Error('Dynamic projection failed')
        }
        return data.items.map(item => item.label)
      }),
      bind('.item', data => data.items),
      bind('.outside-late', data => data.headline),
      prop(
        '.host',
        data => data.items.map(item => {
          return trustedHTML(
            document,
            `<${item.format} class="late">Raw</${item.format}>`,
          )
        }),
        'innerHTML',
      ),
      prop(
        '.outside-host',
        () => trustedHTML(
          document,
          '<h1 class="outside-late">Raw headline</h1>',
        ),
        'innerHTML',
      ),
    ],
  })

  const before = Array.from(mounted.root.querySelectorAll('.late'))
  const outsideBefore = mounted.root.querySelector('.outside-late')

  assert.deepEqual(
    before.map(element => element.textContent),
    ['First', 'Second'],
  )
  assert.equal(outsideBefore?.textContent, 'Initial headline')

  assert.throws(
    () => mounted.update({
      items: [
        { label: 'Rejected first', format: 'strong' },
        { label: 'Rejected second', format: 'em' },
      ],
      headline: 'Rejected headline',
      fail: true,
    }),
    /Dynamic projection failed/,
  )
  assert.deepEqual(
    before.map(element => element.textContent),
    ['First', 'Second'],
  )
  assert.equal(outsideBefore?.textContent, 'Initial headline')

  mounted.update({
    items: [
      { label: 'Updated first', format: 'strong' },
      { label: 'Updated second', format: 'em' },
    ],
    headline: 'Updated headline',
    fail: false,
  })

  const after = Array.from(mounted.root.querySelectorAll('.late'))

  assert.deepEqual(
    after.map(element => element.textContent),
    ['Updated first', 'Updated second'],
  )
  assert.deepEqual(after, before)
  assert.strictEqual(
    mounted.root.querySelector('.outside-late'),
    outsideBefore,
  )
  assert.equal(outsideBefore?.textContent, 'Updated headline')
})

test('treats descendants removed by parent bind as zero selector matches', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <article class="person"><span class="name">Initial</span></article>
  `)
  let descendantProjectionCount = 0
  const mounted = render({}, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.person .name', () => {
        descendantProjectionCount += 1
        return 'Lovelace'
      }),
      bind('.person', () => 'Ada'),
    ],
  })

  assert.equal(mounted.root.textContent, 'Ada')
  assert.equal(mounted.root.querySelector('.name'), null)
  assert.equal(descendantProjectionCount, 0)
})

test('uses the last declaration for duplicate and overlapping scalar sinks', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output class="value shared"></output>
      <output class="shared"></output>
    </section>
  `)
  const mounted = render({
    first: 'First',
    last: 'Last',
    title: 'Initial title',
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.shared', data => data.first),
      bind('.value', data => data.last),
      prop('.value', data => data.first, 'lumiValue'),
      prop('.value', data => data.last, 'lumiValue'),
      attr('.value', 'title', data => data.title),
      attr('.value', 'title', () => 'Owned last'),
    ],
  })
  const outputs = mounted.root.querySelectorAll('output')
  const firstOutput = outputs[0]

  assert.ok(firstOutput)

  assert.deepEqual(
    Array.from(outputs, element => element.textContent),
    ['Last', 'First'],
  )
  assert.equal(Reflect.get(firstOutput, 'lumiValue'), 'Last')
  assert.equal(firstOutput.getAttribute('title'), 'Owned last')

  mounted.update({
    first: 'Changed first',
    last: 'Last',
    title: 'Changed title',
  })

  assert.deepEqual(
    Array.from(outputs, element => element.textContent),
    ['Last', 'Changed first'],
  )
  assert.equal(Reflect.get(firstOutput, 'lumiValue'), 'Last')
  assert.equal(firstOutput.getAttribute('title'), 'Owned last')
})

test('orders structural properties before descendant selectors', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<article class="person"><span class="name"></span></article>',
  )
  const mounted = render({
    markup: '<span class="name" data-prefix="Planned"></span>',
    name: 'Katherine Johnson',
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.person .name', (data, element) => {
        return `${element.getAttribute('data-prefix')}: ${data.name}`
      }),
      prop(
        '.person',
        data => trustedHTML(document, data.markup),
        'innerHTML',
      ),
    ],
  })

  assert.equal(
    mounted.root.querySelector('.name')?.textContent,
    'Planned: Katherine Johnson',
  )
})

test('keeps live parent structure unchanged when a planned descendant fails', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <article class="person"><span class="name">Before</span></article>
  `)
  const mounted = render({
    markup: '<span class="name">Before</span>',
    name: 'Before',
    fail: false,
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.person .name', data => {
        if (data.fail) {
          throw new Error('Planned descendant failed')
        }
        return data.name
      }),
      prop(
        '.person',
        data => trustedHTML(document, data.markup),
        'innerHTML',
      ),
    ],
  })
  const before = mounted.root.querySelector('.name')

  assert.throws(
    () => mounted.update({
      markup: '<span class="name">Rejected structure</span>',
      name: 'Rejected',
      fail: true,
    }),
    /Planned descendant failed/,
  )
  assert.strictEqual(mounted.root.querySelector('.name'), before)
  assert.equal(before?.textContent, 'Before')

  mounted.update({
    markup: '<span class="name">New structure</span>',
    name: 'After',
    fail: false,
  })
  assert.equal(mounted.root.querySelector('.name')?.textContent, 'After')
})

test('allows application code to inject JSONPath projections', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output>count is <span data-bind="$.count">0</span></output>
      <ul class="item" data-bind="$.items">
        <li data-bind="$.items.name">Default item</li>
      </ul>
      <div data-html="$.markup"></div>
      <button
        data-attr-title="$.title"
        data-disabled="$.disabled"
      >Save</button>
    </section>
  `)
  const mounted = render({
    count: 2,
    disabled: true,
    items: [
      { name: 'Ada' },
      { name: 'Grace' },
    ],
    markup: '<strong>Ready</strong>',
    title: 'Save changes',
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind(
        '[data-bind]',
        (data, element) => {
          return jsonPath(
            data,
            element.getAttribute('data-bind') ?? undefined,
          )
        },
      ),
      prop(
        '[data-html]',
        (data, element) => {
          const markup = jsonPath(
            data,
            element.getAttribute('data-html') ?? undefined,
          )
          return typeof markup === 'string'
            ? trustedHTML(document, markup)
            : markup
        },
        'innerHTML',
      ),
      prop(
        '[data-disabled]',
        (data, element) => {
          return jsonPath(
            data,
            element.getAttribute('data-disabled') ?? undefined,
          )
        },
        'disabled',
      ),
      attr(
        '[data-attr-title]',
        'title',
        (data, element) => {
          return jsonPath(
            data,
            element.getAttribute('data-attr-title') ?? undefined,
          )
        },
      ),
    ],
  })

  assert.equal(mounted.root.querySelector('output')?.textContent, 'count is 2')
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent?.trim(),
    ),
    ['Ada', 'Grace'],
  )
  assert.equal(
    mounted.root.querySelector('[data-html]')?.innerHTML,
    '<strong>Ready</strong>',
  )
  assert.equal(
    mounted.root.querySelector('button')?.getAttribute('title'),
    'Save changes',
  )
  assert.equal(
    /** @type {HTMLButtonElement | null} */ (
      mounted.root.querySelector('button')
    )?.disabled,
    true,
  )
})

test('does not repeat normalized innerHTML property writes', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<div></div>')
  const mounted = component({
    template,
    bindings: [
      prop(
        'div',
        data => trustedHTML(document, data.markup),
        'innerHTML',
      ),
    ],
  }).mount(document.createElement('div'))
  const innerHtml = Object.getOwnPropertyDescriptor(
    document.defaultView?.Element.prototype,
    'innerHTML',
  )
  let writeCount = 0

  assert.ok(innerHtml?.get)
  assert.ok(innerHtml.set)

  Object.defineProperty(mounted.root, 'innerHTML', {
    configurable: true,
    get() {
      return innerHtml.get?.call(this)
    },
    set(value) {
      writeCount += 1
      innerHtml.set?.call(this, value)
    },
  })

  mounted.update({ markup: '<br/>' })
  mounted.update({ markup: '<br/>' })

  assert.equal(mounted.root.innerHTML, '<br>')
  assert.equal(writeCount, 1)
})

test('allows independently attached native event handlers', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output class="value">0</output>
      <button class="increment" type="button">Increment</button>
    </section>
  `)
  const target = document.createElement('div')
  let data = { count: 0 }

  const mounted = render(data, {
    target,
    template,
    bindings: [
      bind('.value', data => data.count),
    ],
  })
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('.increment')
  )

  assert.equal(mounted.root.querySelector('.value')?.textContent, '0')

  button.addEventListener('click', () => {
    data = { count: data.count + 1 }
    mounted.update(data)
  })
  button.dispatchEvent(new window.Event('click', { bubbles: true }))

  assert.equal(mounted.root.querySelector('.value')?.textContent, '1')
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
      prop('button', data => data.value, 'lumiProbe'),
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

  mounted.update({ value: 1 })
  mounted.update({ value: 1 })
  mounted.update({ value: 2 })

  assert.equal(storedValue, '2')
  assert.equal(writeCount, 2)
})

test('restores a bound property after the browser changes it', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<input type="text">')
  /** @type {import('../src/index.js').ComponentOptions<{ value: string }>} */
  const options = {
    template,
    bindings: [prop('input', data => data.value, 'value')],
  }
  const target = document.createElement('div')
  const mounted = component(options).mount(target)
  const input = /** @type {HTMLInputElement} */ (mounted.root)

  mounted.update({ value: 'authoritative' })
  input.value = 'user edit'
  mounted.update({ value: 'authoritative' })

  assert.equal(input.value, 'authoritative')
})

test('does not construct custom elements merely to prepare scalar updates', () => {
  const { document, window } = createDocument()
  let constructorCount = 0

  class PlanningProbe extends window.HTMLElement {
    constructor() {
      super()
      constructorCount += 1
    }
  }

  window.customElements.define('planning-probe', PlanningProbe)
  const template = createTemplate(
    document,
    '<planning-probe><span class="copy"></span></planning-probe>',
  )
  const mounted = component({
    template,
    bindings: [
      bind('.copy', data => data.copy),
      prop(
        'planning-probe',
        () => trustedHTML(document, '<span class="copy"></span>'),
        'innerHTML',
      ),
    ],
  }).mount(document.createElement('div'))
  const mountedConstructorCount = constructorCount
  const copy = mounted.root.querySelector('.copy')

  mounted.update({ copy: 'First' })
  mounted.update({ copy: 'Second' })

  assert.equal(constructorCount, mountedConstructorCount)
  assert.strictEqual(mounted.root.querySelector('.copy'), copy)
  assert.equal(mounted.root.textContent, 'Second')
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
    bindings: [bind('.name', data => data.name)],
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

  mounted.update({ profile: { name: 'Ada' } })
  const childRoot = mounted.root.querySelector('.name')
  assert.equal(childRoot?.textContent, 'Ada')

  mounted.update({ profile: { name: 'Grace' } })
  assert.strictEqual(mounted.root.querySelector('.name'), childRoot)
  assert.equal(childRoot?.textContent, 'Grace')
})

test('keeps parent scalar selectors outside child-owned subtrees', () => {
  const { document } = createDocument()
  const childTemplate = createTemplate(
    document,
    '<strong class="name">Unknown</strong>',
  )
  const childComponent = component({
    template: childTemplate,
    bindings: [bind('.name', data => data.name)],
  })
  const parentTemplate = createTemplate(
    document,
    '<section><div class="profile-slot"></div></section>',
  )
  let parentProjectionCount = 0
  const mounted = render({ profile: { name: 'Ada' } }, {
    target: document.createElement('div'),
    template: parentTemplate,
    bindings: [
      bind('.profile-slot .name', () => {
        parentProjectionCount += 1
        return 'Parent override'
      }),
      prop('.profile-slot', () => true, 'hidden'),
      child('.profile-slot', childComponent, data => data.profile),
    ],
  })

  assert.equal(mounted.root.querySelector('.name')?.textContent, 'Ada')
  assert.equal(parentProjectionCount, 0)
  assert.equal(
    /** @type {HTMLElement} */ (
      mounted.root.querySelector('.profile-slot')
    ).hidden,
    true,
  )
})

test('rejects parent content writes that would replace a child subtree', () => {
  const { document } = createDocument()
  const childTemplate = createTemplate(
    document,
    '<strong class="name">Child default</strong>',
  )
  const parentTemplate = createTemplate(
    document,
    '<section class="shell"><div class="profile-slot"></div></section>',
  )
  const mounted = component({
    template: parentTemplate,
    bindings: [
      prop(
        '.shell',
        () => trustedHTML(document, '<p>Replacement</p>'),
        'innerHTML',
      ),
      child(
        '.profile-slot',
        component({ template: childTemplate }),
        data => data,
      ),
    ],
  }).mount(document.createElement('div'))
  const childRoot = mounted.root.querySelector('.name')

  assert.throws(
    () => mounted.update({}),
    /cannot replace a child subtree/,
  )
  assert.strictEqual(mounted.root.querySelector('.name'), childRoot)
})

test('accepts genuine TrustedHTML for innerHTML property bindings', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<div></div>')
  const mounted = component({
    template,
    bindings: [
      prop(
        'div',
        data => trustedHTML(document, data.markup),
        'innerHTML',
      ),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ markup: '<strong>Ready</strong>' })

  assert.equal(mounted.root.innerHTML, '<strong>Ready</strong>')
})

test('rejects strings and forged objects for TrustedHTML properties', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<section><div class="markup">Initial</div></section>',
  )
  const mounted = component({
    template,
    bindings: [prop('.markup', data => data.markup, 'innerHTML')],
  }).mount(document.createElement('div'))

  assert.throws(
    () => mounted.update({ markup: '<strong>Unsafe</strong>' }),
    /property "innerHTML" projection must return TrustedHTML; received type string/,
  )
  assert.equal(
    mounted.root.querySelector('.markup')?.textContent,
    'Initial',
  )

  assert.throws(
    () => mounted.update({
      markup: {
        toString() {
          return '<strong>Forged</strong>'
        },
      },
    }),
    /property "innerHTML" projection must return TrustedHTML; received type object/,
  )
  assert.equal(
    mounted.root.querySelector('.markup')?.textContent,
    'Initial',
  )

  mounted.update({
    markup: trustedHTML(document, '<strong>Trusted</strong>'),
  })
  assert.equal(
    mounted.root.querySelector('.markup')?.innerHTML,
    '<strong>Trusted</strong>',
  )
})

test('accepts genuine TrustedHTML for a non-root outerHTML binding', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<section><p class="replace">Initial</p></section>',
  )
  const mounted = component({
    template,
    bindings: [prop(
      '.replace',
      data => data.markup,
      'outerHTML',
    )],
  }).mount(document.createElement('div'))

  mounted.update({
    markup: trustedHTML(
      document,
      '<article class="replacement">Trusted</article>',
    ),
  })

  assert.equal(mounted.root.querySelector('.replace'), null)
  assert.equal(
    mounted.root.querySelector('.replacement')?.textContent,
    'Trusted',
  )
})

test('bind works without the Trusted Types API or an HTML property sink', () => {
  const { document, window } = createDocument()
  const template = createTemplate(
    document,
    '<ul><li class="item">Default</li></ul>',
  )
  Reflect.deleteProperty(window, 'trustedTypes')
  const mounted = component({
    template,
    bindings: [bind('.item', data => data.items)],
  }).mount(document.createElement('div'))

  mounted.update({ items: ['Ada', 'Grace'] })

  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    ),
    ['Ada', 'Grace'],
  )
})

test('does not inspect Trusted Types for bindings without HTML sinks', () => {
  const { document, window } = createDocument()
  const template = createTemplate(
    document,
    '<section><output></output><button></button></section>',
  )

  Object.defineProperty(window, 'trustedTypes', {
    configurable: true,
    get() {
      throw new Error('Safe bindings must not inspect Trusted Types')
    },
  })

  const mounted = component({
    template,
    bindings: [
      bind('output', data => data.text),
      prop('button', data => data.disabled, 'disabled'),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ text: 'Ready', disabled: true })

  assert.equal(mounted.root.querySelector('output')?.textContent, 'Ready')
  assert.equal(
    /** @type {HTMLButtonElement | null} */ (
      mounted.root.querySelector('button')
    )?.disabled,
    true,
  )
})

test('resolves Trusted Types once for a component with HTML sinks', () => {
  const { document, window } = createDocument()
  const markup = trustedHTML(document, '<strong>Ready</strong>')
  const factory = Reflect.get(window, 'trustedTypes')
  const template = createTemplate(document, '<div></div>')
  let factoryReads = 0

  Object.defineProperty(window, 'trustedTypes', {
    configurable: true,
    get() {
      factoryReads += 1
      return factory
    },
  })

  const mounted = component({
    template,
    bindings: [prop('div', () => markup, 'innerHTML')],
  }).mount(document.createElement('div'))

  assert.equal(factoryReads, 1)

  mounted.update({})
  mounted.update({})

  assert.equal(factoryReads, 1)
  assert.equal(mounted.root.innerHTML, '<strong>Ready</strong>')
})

test('fails closed when TrustedHTML cannot be authenticated', () => {
  const { document, window } = createDocument()
  const markup = trustedHTML(document, '<strong>Trusted elsewhere</strong>')
  const template = createTemplate(document, '<div></div>')
  Reflect.deleteProperty(window, 'trustedTypes')
  const mounted = component({
    template,
    bindings: [prop('div', () => markup, 'innerHTML')],
  }).mount(document.createElement('div'))

  assert.throws(
    () => mounted.update({}),
    /requires TrustedHTML.*does not expose the Trusted Types API/,
  )
  assert.equal(mounted.root.innerHTML, '')
})

test('keeps iframe documents and native handlers out of generic bindings', () => {
  assert.throws(
    () => prop('button', () => () => {}, 'onclick'),
    /use event\(\)/,
  )
  assert.throws(
    () => attr('button', 'onclick', () => 'run()'),
    /use event\(\)/,
  )
  assert.throws(
    () => attr('iframe', 'srcdoc', () => '<script>run()</script>'),
    /trusted-content API/,
  )
})

test('does not commit scalar writes when preparation fails', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output class="first">Initial first</output>
      <output class="second">Initial second</output>
    </section>
  `)
  const mounted = render({
    first: 'Before first',
    second: 'Before second',
    fail: false,
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.first', data => data.first),
      bind('.second', data => {
        if (data.fail) {
          throw new Error('Scalar projection failed')
        }
        return data.second
      }),
    ],
  })

  const first = mounted.root.querySelector('.first')
  const second = mounted.root.querySelector('.second')

  assert.throws(
    () => mounted.update({
      first: 'Rejected first',
      second: 'Rejected second',
      fail: true,
    }),
    /Scalar projection failed/,
  )
  assert.equal(first?.textContent, 'Before first')
  assert.equal(second?.textContent, 'Before second')

  mounted.update({
    first: 'After first',
    second: 'After second',
    fail: false,
  })
  assert.equal(first?.textContent, 'After first')
  assert.equal(second?.textContent, 'After second')
})

test('adds binding context when a projection throws', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output class="value"></output>
      <output class="value"></output>
    </section>
  `)
  const failure = new TypeError('Value is unavailable')
  const mounted = component({
    template,
    bindings: [
      bind('.value', (_data, element) => {
        if (element.previousElementSibling !== null) {
          throw failure
        }
        return 'First value'
      }),
    ],
  }).mount(document.createElement('div'))

  /** @type {unknown} */
  let error

  try {
    mounted.update({})
  } catch (caught) {
    error = caught
  }

  assert.ok(error instanceof Error)
  assert.match(
    error.message,
    /Lumi bind projection for "\.value" at matched position 2 failed: Value is unavailable/,
  )
  assert.equal(error.cause, failure)
})

test('rejects incompatible values and treats nullish projections as no-ops', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output class="copy">Initial text</output>
      <div class="markup"><em>Initial HTML</em></div>
      <button class="control active" title="Initial title"></button>
    </section>
  `)

  /**
   * Casts unknown test input through each public callback contract so this
   * runtime-validation test can deliberately supply invalid JavaScript.
   *
   * @template Value
   * @param {unknown} value
   * @returns {Value}
   */
  function unchecked(value) {
    return /** @type {Value} */ (value)
  }

  /**
   * @typedef {{
   *   text: unknown,
   *   html: unknown,
   *   title: unknown,
   *   active: unknown,
   *   color: unknown
   * }} ScalarInput
   */

  /** @type {ScalarInput} */
  const valid = {
    text: 'Before text',
    html: '<strong>Before HTML</strong>',
    title: 'Before title',
    active: true,
    color: 'red',
  }
  const mounted = render(valid, {
    target: document.createElement('div'),
    template,
    bindings: [
      bind('.copy', data => unchecked(data.text)),
      prop(
        '.markup',
        data => {
          const markup = unchecked(data.html)
          return typeof markup === 'string'
            ? trustedHTML(document, markup)
            : markup
        },
        'innerHTML',
      ),
      attr('.control', 'title', data => unchecked(data.title)),
      classToggle('.control', 'active', data => unchecked(data.active)),
      style('.control', 'color', data => unchecked(data.color)),
    ],
  })
  const copy = /** @type {HTMLOutputElement} */ (
    mounted.root.querySelector('.copy')
  )
  const markup = /** @type {HTMLDivElement} */ (
    mounted.root.querySelector('.markup')
  )
  const control = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('.control')
  )

  function assertUnchanged() {
    assert.equal(copy.textContent, 'Before text')
    assert.equal(markup.innerHTML, '<strong>Before HTML</strong>')
    assert.equal(control.title, 'Before title')
    assert.equal(control.classList.contains('active'), true)
    assert.equal(control.style.color, 'red')
  }

  const invalidUpdates = [
    {
      data: { ...valid, text: { nested: true } },
      message: /Lumi bind projection must return .*received type object/,
    },
    {
      data: { ...valid, title: ['not', 'text'] },
      message: /Lumi attribute projection must return .*received an array/,
    },
    {
      data: { ...valid, active: 'true' },
      message: /Lumi classToggle projection must return .*received type string/,
    },
  ]

  for (const { data, message } of invalidUpdates) {
    assert.throws(() => mounted.update(data), message)
    assertUnchanged()
  }

  mounted.update({
    text: undefined,
    html: null,
    title: undefined,
    active: null,
    color: null,
  })
  assertUnchanged()

  mounted.update({
    text: 'After text',
    html: '<strong>After HTML</strong>',
    title: 'After title',
    active: false,
    color: 'blue',
  })

  assert.equal(copy.textContent, 'After text')
  assert.equal(markup.innerHTML, '<strong>After HTML</strong>')
  assert.equal(control.title, 'After title')
  assert.equal(control.classList.contains('active'), false)
  assert.equal(control.style.color, 'blue')
})

test('mount replaces existing target contents', () => {
  const { document } = createDocument()
  const target = document.createElement('div')
  const fallback = document.createElement('p')
  fallback.textContent = 'Server fallback'
  target.append(fallback)
  const template = createTemplate(document, '<section>Mounted</section>')
  const mounted = component({ template }).mount(target)

  assert.equal(target.childNodes.length, 1)
  assert.strictEqual(target.firstElementChild, mounted.root)
  assert.equal(fallback.isConnected, false)
})

test('mount restores target contents when binding connection fails', () => {
  const { document } = createDocument()
  const target = document.createElement('div')
  const fallback = document.createElement('p')
  fallback.textContent = 'Server fallback'
  target.append(fallback)
  const template = createTemplate(document, '<section>Mounted</section>')
  /** @type {import('../src/types.js').Binding<unknown>} */
  const failingBinding = {
    connect() {
      throw new Error('Connection failed')
    },
  }

  assert.throws(
    () => component({
      template,
      bindings: [failingBinding],
    }).mount(target),
    /Connection failed/,
  )
  assert.equal(target.childNodes.length, 1)
  assert.strictEqual(target.firstElementChild, fallback)
})

test('preserves arbitrary values for property bindings', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<div></div>')
  const config = { mode: 'compact' }
  const mounted = render({ config }, {
    target: document.createElement('div'),
    template,
    bindings: [prop('div', data => data.config, 'lumiConfig')],
  })

  assert.strictEqual(Reflect.get(mounted.root, 'lumiConfig'), config)
})

test('discards custom binding work when later preparation fails', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<section><output>Before</output></section>',
  )
  let commitCount = 0
  let discardCount = 0

  /** @type {import('../src/types.js').Binding<{ fail: boolean }>} */
  const probe = {
    connect() {
      return {
        prepare() {
          return {
            commit() {
              commitCount += 1
            },
            discard() {
              discardCount += 1
            },
          }
        },
        destroy() {},
      }
    },
  }
  const mounted = component({
    template,
    bindings: [
      probe,
      bind('output', data => {
        if (data.fail) {
          throw new Error('Later preparation failed')
        }
        return 'After'
      }),
    ],
  }).mount(document.createElement('div'))

  assert.throws(
    () => mounted.update({ fail: true }),
    /Later preparation failed/,
  )
  assert.equal(commitCount, 0)
  assert.equal(discardCount, 1)
  assert.equal(mounted.root.textContent, 'Before')

  mounted.update({ fail: false })
  assert.equal(commitCount, 1)
  assert.equal(discardCount, 1)
  assert.equal(mounted.root.textContent, 'After')
})

test('faults a component when an arbitrary DOM setter fails during commit', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output>Before</output>
      <button type="button"></button>
    </section>
  `)
  const target = document.createElement('div')
  const mounted = component({
    template,
    bindings: [
      bind('output', data => data.text),
      prop('button', data => data.value, 'lumiProbe'),
    ],
  }).mount(target)
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('button')
  )

  Object.defineProperty(button, 'lumiProbe', {
    configurable: true,
    get() {
      return 'before'
    },
    set() {
      throw new Error('DOM setter failed')
    },
  })

  assert.throws(
    () => mounted.update({ text: 'Partially committed', value: 'after' }),
    /DOM setter failed/,
  )
  assert.equal(
    mounted.root.querySelector('output')?.textContent,
    'Partially committed',
  )
  assert.throws(
    () => mounted.update({ text: 'Retry', value: 'retry' }),
    /faulted Lumi component/,
  )

  mounted.unmount()
  assert.equal(target.childElementCount, 0)
})

test('finishes unmount cleanup when a binding destroy throws', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<section></section>')
  const target = document.createElement('div')
  /** @type {string[]} */
  const destroyed = []

  /**
   * @param {string} name
   * @param {boolean} [throws]
   * @returns {import('../src/types.js').Binding<unknown>}
   */
  function cleanupProbe(name, throws = false) {
    return {
      connect() {
        return {
          prepare() {
            return { commit() {} }
          },
          destroy() {
            destroyed.push(name)
            if (throws) {
              throw new Error(`${name} destroy failed`)
            }
          },
        }
      },
    }
  }

  const mounted = component({
    template,
    bindings: [
      cleanupProbe('first'),
      cleanupProbe('throwing', true),
      cleanupProbe('last'),
    ],
  }).mount(target)

  assert.throws(
    () => mounted.unmount(),
    /throwing destroy failed/,
  )
  assert.deepEqual(destroyed, ['last', 'throwing', 'first'])
  assert.equal(target.childElementCount, 0)
  assert.throws(() => mounted.update({}), /unmounted/)

  mounted.unmount()
  assert.deepEqual(destroyed, ['last', 'throwing', 'first'])
})

test('rejects invalid templates and stale renders', () => {
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
  const unmatched = render({}, {
    target,
    template: missingTargetTemplate,
    bindings: [bind('.missing', () => 'value')],
  })
  assert.equal(unmatched.root.textContent, 'Text')
  unmatched.unmount()
  assert.throws(
    () => unmatched.update({}),
    /unmounted/,
  )

  const outerHtml = component({
    template: missingTargetTemplate,
    bindings: [
      prop(
        'p',
        () => trustedHTML(document, '<p>Replacement</p>'),
        'outerHTML',
      ),
    ],
  }).mount(target)
  const outerRoot = outerHtml.root
  assert.throws(
    () => outerHtml.update({}),
    /cannot replace a mounted component root/,
  )
  assert.strictEqual(outerHtml.root, outerRoot)
  assert.equal(target.firstElementChild, outerRoot)
  outerHtml.unmount()

  assert.throws(
    () => render({}, {
      target: null,
      template: missingTargetTemplate,
    }),
    /mount target/,
  )

  assert.throws(
    () => render({ value: 'first' }, {
      target,
      template: missingTargetTemplate,
      bindings: [
        bind('p', () => {
          throw new Error('Projection failed')
        }),
      ],
    }),
    /Projection failed/,
  )
  assert.equal(target.childElementCount, 0)
})
