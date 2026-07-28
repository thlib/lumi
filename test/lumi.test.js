// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {jsonPath} from '../examples/data-path.js'
import {
  attr as contextualAttr,
  child,
  classToggle as contextualClassToggle,
  component,
  on,
  prop as contextualProp,
  repeat,
  style as contextualStyle,
  text,
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

/**
 * Adapts the former data-first scalar callback style to text's contextual
 * callback. Repetition is deliberately not supported here.
 *
 * @template Data
 * @param {string} selector
 * @param {(data: Data, el: Element) => string | number | boolean | null | undefined} project
 * @returns {import('../src/types.js').Binding<Data>}
 */
function textData(selector, project) {
  return text(selector, ({data}, el) => project(data, el))
}

/**
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data, el: Element) => unknown} project
 * @returns {import('../src/types.js').Binding<Data>}
 */
function attr(selector, name, project) {
  return contextualAttr(selector, name, ({data}, el) => {
    return /** @type {never} */ (project(data, el))
  })
}

/**
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data, el: Element) => unknown} project
 * @returns {import('../src/types.js').Binding<Data>}
 */
function classToggle(selector, name, project) {
  return contextualClassToggle(selector, name, ({data}, el) => {
    return /** @type {never} */ (project(data, el))
  })
}

/**
 * @template Data
 * @param {string} selector
 * @param {(data: Data, el: Element) => unknown} project
 * @param {string} name
 * @returns {import('../src/types.js').Binding<Data>}
 */
function prop(selector, project, name) {
  return contextualProp(selector, ({data}, el) => project(data, el), name)
}

/**
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data, el: Element) => unknown} project
 * @returns {import('../src/types.js').Binding<Data>}
 */
function style(selector, name, project) {
  return contextualStyle(selector, name, ({data}, el) => {
    return /** @type {never} */ (project(data, el))
  })
}

test('exposes only the APIs used by Lumi applications', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'attr',
    'child',
    'classToggle',
    'component',
    'on',
    'prop',
    'repeat',
    'style',
    'text',
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
      on('.action', 'click', (nativeEvent, element) => {
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

test('event handlers follow elements repeated by repeat', () => {
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
      repeat('.item', ({data}) => /** @type {{items: object[]}} */ (data).items),
      on('.item button', 'click', (_nativeEvent, element) => {
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
      textData('.value', data => data.count),
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
      textData('.value', data => data.count),
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

test('classToggle updates one token without repeated DOMTokenList work', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<button class="control  base\tstate[1] state[1] tail "></button>',
  )
  const mounted = component({
    template,
    bindings: [
      classToggle('.control', 'state[1]', data => data.active),
    ],
  }).mount(document.createElement('div'))
  const control = /** @type {HTMLButtonElement} */ (
    mounted.root
  )

  mounted.update({active: false})
  assert.equal(control.getAttribute('class'), 'control  base\t  tail ')

  Object.defineProperties(control.classList, {
    contains: {
      value() {
        throw new Error('classToggle searched DOMTokenList more than once')
      },
    },
    toggle: {
      value() {
        throw new Error('classToggle used DOMTokenList to write a class')
      },
    },
  })

  mounted.update({active: true})
  assert.equal(control.classList.value, 'control  base\t  tail state[1]')

  mounted.update({active: false})
  assert.equal(control.classList.value, 'control  base\t  tail ')
})

test('style updates a standard property and keeps other styles', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<button class="control" style="color: blue"></button>',
  )
  const mounted = component({
    template,
    bindings: [
      style('.control', 'background-color', data => data.background),
    ],
  }).mount(document.createElement('div'))
  const control = /** @type {HTMLButtonElement} */ (
    mounted.root
  )

  mounted.update({background: 'red'})
  assert.equal(control.style.backgroundColor, 'red')
  assert.equal(control.style.color, 'blue')

  mounted.update({background: ''})
  assert.equal(control.style.backgroundColor, '')
  assert.equal(control.style.color, 'blue')
})

test('style uses CSSOM methods for custom properties', () => {
  const { document } = createDocument()
  const template = createTemplate(document, '<button class="control"></button>')
  const mounted = component({
    template,
    bindings: [
      style('.control', '--tone', data => data.tone),
    ],
  }).mount(document.createElement('div'))
  const control = /** @type {HTMLButtonElement} */ (
    mounted.root
  )

  mounted.update({tone: 'red'})
  assert.equal(control.style.getPropertyValue('--tone'), 'red')

  mounted.update({tone: ''})
  assert.equal(control.style.getPropertyValue('--tone'), '')
})

test('repeats targets inside open shadow roots', () => {
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
      bindings: [
        repeat('.item', ({data}) => data.items),
        text('.item', ({item}) => item),
      ],
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
    bindings: [textData('.child-value', data => data)],
  })
  const mounted = component({
    template: createTemplate(document, '<shadow-host></shadow-host>'),
    bindings: [
      child('.child-slot', childComponent, data => data.child),
      textData('.parent-value', data => data.parent),
      textData('.child-value', () => 'Parent must not reach this'),
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

test('discovers an open shadow root attached between updates', () => {
  const { document } = createDocument()
  const mounted = component({
    template: createTemplate(
      document,
      '<section><div class="host"></div></section>',
    ),
    bindings: [textData('.value', data => data.value)],
  }).mount(document.body)

  mounted.update({ value: 'Before shadow' })

  const host = /** @type {HTMLElement} */ (
    mounted.root.querySelector('.host')
  )
  const shadow = host.attachShadow({ mode: 'open' })
  const output = document.createElement('output')
  output.className = 'value'
  shadow.append(output)

  mounted.update({ value: 'After shadow' })

  assert.equal(output.textContent, 'After shadow')
})

test('rechecks shadow topology after a live setter changes it', () => {
  const { document, window } = createDocument()

  class ShadowMaker extends window.HTMLElement {
    /** @param {boolean} active */
    set active(active) {
      if (active && this.shadowRoot === null) {
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = '<output class="value">Created</output>'
      }
    }
  }

  window.customElements.define('shadow-maker', ShadowMaker)
  const mounted = component({
    template: createTemplate(document, `
      <section>
        <shadow-maker></shadow-maker>
        <output class="value">Default</output>
      </section>
    `),
    bindings: [
      prop('shadow-maker', () => true, 'active'),
      textData('.value', () => 'Updated'),
    ],
  }).mount(document.body)

  assert.throws(
    () => mounted.update({}),
    /DOM changed while committing selector "\.value"/,
  )
})

test('checks light DOM shadow topology once per update phase', () => {
  const { document } = createDocument()
  const mounted = component({
    template: createTemplate(document, `
      <section>
        <output class="first">Default</output>
        <output class="second">Default</output>
      </section>
    `),
    bindings: [
      textData('.first', data => data.first),
      textData('.second', data => data.second),
    ],
  }).mount(document.body)
  const nativeCreateTreeWalker = document.createTreeWalker
  let topologyChecks = 0

  /** @param {Node} scope @param {number} [whatToShow] */
  document.createTreeWalker = function createTreeWalker(scope, whatToShow) {
    if (scope === mounted.root) {
      topologyChecks += 1
    }

    return nativeCreateTreeWalker.call(this, scope, whatToShow)
  }

  mounted.update({ first: 'First', second: 'Second' })
  topologyChecks = 0
  // Text writes cannot introduce a shadow host, so committing them does not
  // cost another topology check.
  mounted.update({ first: 'Changed', second: 'Also changed' })

  assert.equal(topologyChecks, 2)
  assert.equal(mounted.root.querySelector('.first')?.textContent, 'Changed')
  assert.equal(
    mounted.root.querySelector('.second')?.textContent,
    'Also changed',
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
      textData('output', (data, element) => {
        return `${element.getAttribute('data-field')}: ${data.count}`
      }),
    ],
  })

  assert.equal(mounted.root.textContent, 'count: 2')
})

test('repeats targets for array projection values', () => {
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
      repeat('.item', ({data}) => {
        projectionCount += 1
        return data.items
      }),
      text('.item', ({item}) => item),
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

test('evaluates each projection once with explicit repeat planning', () => {
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
      textData('.before', data => {
        calls.before += 1
        return data.before
      }),
      repeat('.item', ({data}) => {
        calls.items += 1
        return /** @type {{items: string[]}} */ (data).items
      }),
      text('.item', ({item}) => item),
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
    items: ['One item'],
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

test('keeps failed repeat preparation recoverable', () => {
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
      repeat('.item', ({data}) => {
        itemProjectionCount += 1
        return /** @type {{items: string[]}} */ (data).items
      }),
      text('.item', ({item}) => item),
      attr('button', 'title', data => {
        titleProjectionCount += 1
        return data.title
      }),
    ],
  }).mount(document.createElement('div'))
  const item = mounted.root.querySelector('.item')

  mounted.update({
    items: ['Rejected'],
    title: /** @type {never} */ ({ invalid: true }),
  })
  assert.equal(itemProjectionCount, 1)
  assert.equal(titleProjectionCount, 1)
  assert.strictEqual(mounted.root.querySelector('.item'), item)
  assert.equal(item?.textContent, 'Rejected')

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

test('keeps repeat updates on the static cardinality path', () => {
  const { document, window } = createDocument()
  const template = createTemplate(
    document,
    '<ul><li class="item">Default</li></ul>',
  )
  const mounted = component({
    template,
    bindings: [
      repeat('.item', ({data}) => /** @type {{items: string[]}} */ (data).items),
      text('.item', ({item}) => item),
    ],
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

test('expands nested arrays through nested repeat targets', () => {
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
      repeat('.group', ({data}) => /** @type {{groups: string[][]}} */ (data).groups),
      repeat('.name', ({item}) => /** @type {string[]} */ (/** @type {unknown} */ (item))),
      text('.name', ({item}) => item),
      text('.shared', ({data}) => /** @type {{shared: string}} */ (data).shared),
      contextualProp('.name', ({data, path}) => {
        return data.hidden[path[0] ?? 0]?.[path[1] ?? 0]
      }, 'hidden'),
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
      repeat('.group', ({data}) => /** @type {{groups: string[][]}} */ (data).groups),
      repeat('.name', ({item}) => /** @type {string[]} */ (/** @type {unknown} */ (item))),
      text('.name', ({item}) => item),
      contextualProp('.name', ({data, path}) => {
        return data.hidden[path[0] ?? 0]?.[path[1] ?? 0]
      }, 'hidden'),
    ],
  })
  mounted.update({
    groups: [['Rejected'], ['Missing flag']],
    hidden: [[false]],
  })
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.name'), el => el.textContent),
    ['Rejected', 'Missing flag'],
  )

  mounted.update({
    groups: [['After']],
    hidden: [[false]],
  })
  assert.equal(mounted.root.querySelector('.name')?.textContent, 'After')
})

test('rejects repeat at the mounted component root', () => {
  const { document } = createDocument()
  const template = createTemplate(
    document,
    '<output>Default</output>',
  )
  assert.throws(
    () => component({
      template,
      bindings: [repeat('output', ({data}) => /** @type {unknown[]} */ ((/** @type {{value: unknown[]}} */ (data)).value))],
    }).mount(document.createElement('div')),
    /cannot repeat a mounted component root/,
  )
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
      textData('.copy', (data, element) => dataFor(data, element).text),
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
      textData('.person .name', (data, element) => {
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

test('resolves structurally created bindings inside repeat occurrences', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <article class="item">
        <div class="host"></div>
      </article>
      <aside class="outside-host"></aside>
      <p class="late unrelated-late">Unrelated late text</p>
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
      repeat('.item', ({data}) => data.items, [
        text('.late', ({data, item}) => {
          if (data.fail) {
            throw new Error('Dynamic projection failed')
          }
          return item.label
        }),
        contextualProp(
          '.host',
          ({item}) => trustedHTML(
            document,
            `<${item.format} class="late">Raw</${item.format}>`,
          ),
          'innerHTML',
        ),
      ]),
      text('.outside-late', ({data}) => data.headline),
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

  const before = Array.from(mounted.root.querySelectorAll('.item .late'))
  const outsideBefore = mounted.root.querySelector('.outside-late')

  assert.deepEqual(
    before.map(element => element.textContent),
    ['First', 'Second'],
  )
  assert.equal(outsideBefore?.textContent, 'Initial headline')
  assert.equal(
    mounted.root.querySelector('.unrelated-late')?.textContent,
    'Unrelated late text',
  )

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

  const after = Array.from(mounted.root.querySelectorAll('.item .late'))

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
  assert.equal(
    mounted.root.querySelector('.unrelated-late')?.textContent,
    'Unrelated late text',
  )
})

test('treats descendants removed by parent text as zero selector matches', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <article class="person"><span class="name">Initial</span></article>
  `)
  let descendantProjectionCount = 0
  const mounted = render({}, {
    target: document.createElement('div'),
    template,
    bindings: [
      textData('.person .name', () => {
        descendantProjectionCount += 1
        return 'Lovelace'
      }),
      textData('.person', () => 'Ada'),
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
      textData('.shared', data => data.first),
      textData('.value', data => data.last),
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
      textData('.person .name', (data, element) => {
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
      textData('.person .name', data => {
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

test('provides flat bindings with nested positional contexts', () => {
  const {document} = createDocument()
  const template = createTemplate(document, `
    <main>
      <p class="root"></p>
      <section class="group">
        <article class="person">
          <span class="name"></span>
          <small class="shared"></small>
        </article>
      </section>
    </main>
  `)
  /** @type {Array<{item: unknown, index: number, path: ReadonlyArray<number>}>} */
  const contexts = []
  const mounted = render({
    groups: [
      [{name: 'Ada'}, {name: 'Grace'}],
      [{name: 'Katherine'}],
    ],
    shared: 'Global',
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      text('.root', context => {
        contexts.push(context)
        return context.data.shared
      }),
      repeat('.group', ({data}) => data.groups),
      repeat('.person', ({item}) => {
        return /** @type {Array<{name: string}>} */ (
          /** @type {unknown} */ (item)
        )
      }),
      text('.name', context => {
        contexts.push(context)
        return /** @type {{name: string}} */ (context.item).name
      }),
      text('.shared', ({data}) => data.shared),
    ],
  })

  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.name'),
      el => el.textContent,
    ),
    ['Ada', 'Grace', 'Katherine'],
  )
  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.shared'),
      el => el.textContent,
    ),
    ['Global', 'Global', 'Global'],
  )
  assert.deepEqual(
    contexts.map(({index, path}) => ({index, path})),
    [
      {index: 0, path: []},
      {index: 0, path: [0, 0]},
      {index: 1, path: [0, 1]},
      {index: 0, path: [1, 0]},
    ],
  )
})

test('groups repeat bindings without changing occurrence contexts', () => {
  const {document} = createDocument()
  const template = createTemplate(document, `
    <main>
      <section class="group">
        <article class="person"><span class="name"></span></article>
      </section>
      <footer><span class="name outside-name">Outside</span></footer>
    </main>
  `)
  const mounted = render({
    groups: [
      [{name: 'Ada'}, {name: 'Grace'}],
      [{name: 'Katherine'}],
    ],
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      repeat('.group', ({data}) => data.groups, [
        repeat('.person', ({item}) => {
          return /** @type {Array<{name: string}>} */ (
            /** @type {unknown} */ (item)
          )
        }, [
          text('.name', ({item, path}) => `${item.name}:${path.join('.')}`),
        ]),
      ]),
    ],
  })

  assert.deepEqual(
    Array.from(
      mounted.root.querySelectorAll('.person .name'),
      el => el.textContent,
    ),
    ['Ada:0.0', 'Grace:0.1', 'Katherine:1.0'],
  )
  assert.equal(
    mounted.root.querySelector('.outside-name')?.textContent,
    'Outside',
  )
})

test('matches the repeated element as :scope in its binding list', () => {
  const {document} = createDocument()
  const template = createTemplate(document, `
    <main><p class="item">Default</p></main>
  `)
  const mounted = render({items: ['First', 'Second']}, {
    target: document.createElement('div'),
    template,
    bindings: [
      repeat('.item', ({data}) => data.items, [
        text(':scope', ({item}) => item),
      ]),
    ],
  })

  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.item'), el => el.textContent),
    ['First', 'Second'],
  )
})

test('warns once and preserves DOM for invalid repeat and text values', () => {
  const {document, window} = createDocument()
  const template = createTemplate(document, `
    <main>
      <p class="label">Default</p>
      <span class="item">Default item</span>
    </main>
  `)
  /** @type {string[]} */
  const warnings = []
  const originalWarn = window.console.warn
  window.console.warn = (/** @type {unknown[]} */ ...args) => {
    warnings.push(args.map(String).join(' '))
  }

  try {
    const mounted = render(/** @type {{items: unknown, label: unknown}} */ ({
      items: ['First', 'Second'],
      label: 'Ready',
    }), {
      target: document.createElement('div'),
      template,
      bindings: [
        repeat('.item', ({data}) => /** @type {any} */ (data.items)),
        text('.item', ({item}) => /** @type {any} */ (item)),
        text('.label', ({data}) => /** @type {any} */ (data.label)),
      ],
    })

    mounted.update({items: {invalid: true}, label: ['Ignored']})
    mounted.update({items: {invalid: true}, label: ['Ignored again']})

    assert.deepEqual(
      Array.from(
        mounted.root.querySelectorAll('.item'),
        el => el.textContent,
      ),
      ['First', 'Second'],
    )
    assert.equal(mounted.root.querySelector('.label')?.textContent, 'Ready')
    assert.equal(warnings.length, 2)
    assert.ok(warnings.some(msg => {
      return /repeat binding ".item" ignored/.test(msg)
    }))
    assert.ok(warnings.some(msg => {
      return /text binding ".label" ignored/.test(msg)
    }))
  } finally {
    window.console.warn = originalWarn
  }
})

test('rejects invalid repeat structure while mounting', () => {
  const {document} = createDocument()
  const template = createTemplate(document, '<output></output>')

  assert.throws(
    () => component({
      template,
      bindings: [repeat('output', () => [])],
    }).mount(document.createElement('div')),
    /cannot repeat a mounted component root/,
  )
  assert.throws(
    () => component({
      template,
      bindings: [repeat('.missing', () => [])],
    }).mount(document.createElement('div')),
    /must match the component template/,
  )
})

test('allows application code to inject standard JSONPath nodelists', () => {
  const { document } = createDocument()
  const template = createTemplate(document, `
    <section>
      <output>count is <span data-text="$.count">0</span></output>
      <ul>
        <li class="item" data-repeat="$.items[*]">
          <span data-text="$.name">Default item</span>
        </li>
      </ul>
    </section>
  `)
  const mounted = render({
    count: 2,
    items: [
      { name: 'Ada' },
      { name: 'Grace' },
    ],
  }, {
    target: document.createElement('div'),
    template,
    bindings: [
      repeat(
        '[data-repeat]',
        ({item}, el) => {
          return jsonPath(
            item,
            el.getAttribute('data-repeat') ?? undefined,
          )
        },
      ),
      text(
        '[data-text]',
        ({item}, el) => {
          return /** @type {any} */ (
            jsonPath(
              item,
              el.getAttribute('data-text') ?? undefined,
            )[0]
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
  assert.deepEqual(jsonPath({count: 2}, '$.count'), [2])
  assert.deepEqual(jsonPath({count: 3}, '$.count'), [3])
  assert.deepEqual(jsonPath({}, '$.missing'), [])
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
      textData('.value', data => data.count),
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
      textData('.copy', data => data.copy),
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
    bindings: [textData('.name', data => data.name)],
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
    bindings: [textData('.name', data => data.name)],
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
      textData('.profile-slot .name', () => {
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

test('repeat works without the Trusted Types API or an HTML property sink', () => {
  const { document, window } = createDocument()
  const template = createTemplate(
    document,
    '<ul><li class="item">Default</li></ul>',
  )
  Reflect.deleteProperty(window, 'trustedTypes')
  const mounted = component({
    template,
    bindings: [
      repeat('.item', ({data}) => /** @type {{items: string[]}} */ (data).items),
      text('.item', ({item}) => item),
    ],
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
      textData('output', data => data.text),
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
    /use on\(\)/,
  )
  assert.throws(
    () => attr('button', 'onclick', () => 'run()'),
    /use on\(\)/,
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
      textData('.first', data => data.first),
      textData('.second', data => {
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
      textData('.value', (_data, element) => {
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
    /Lumi text projection for "\.value" at matched position 2 failed: Value is unavailable/,
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
      textData('.copy', data => unchecked(data.text)),
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
      data: { ...valid, title: ['not', 'text'] },
      message: /Lumi attribute projection must return .*received an array/,
    },
    {
      data: { ...valid, active: 'true' },
      message: /Lumi classToggle projection must return .*received type string/,
    },
  ]

  for (const { data, message: _message } of invalidUpdates) {
    mounted.update(data)
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
      textData('output', data => {
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
      textData('output', data => data.text),
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
    bindings: [textData('.missing', () => 'value')],
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
        textData('p', () => {
          throw new Error('Projection failed')
        }),
      ],
    }),
    /Projection failed/,
  )
  assert.equal(target.childElementCount, 0)
})
