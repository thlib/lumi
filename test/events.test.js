// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { bind, child, component, on } from '../src/index.js'

/**
 * @returns {{ document: Document, window: import('jsdom').DOMWindow }}
 */
function createDocument() {
  const { window } = new JSDOM('<!doctype html><body></body>')
  return { document: window.document, window }
}

/**
 * @param {Document} document
 * @param {string} html
 * @returns {HTMLTemplateElement}
 */
function createTemplate(document, html) {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  return template
}

/**
 * @param {import('jsdom').DOMWindow} window
 * @param {string} type
 * @param {EventInit} [options]
 * @returns {Event}
 */
function nativeEvent(window, type, options = {}) {
  return new window.Event(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...options,
  })
}

/**
 * Collects the errors Lumi reports for routed handlers instead of letting
 * them reach the host's uncaught-error reporting.
 *
 * @param {import('jsdom').DOMWindow} window
 * @returns {unknown[]}
 */
function captureReportedErrors(window) {
  /** @type {unknown[]} */
  const reported = []
  Reflect.set(window, 'reportError', (/** @type {unknown} */ error) => {
    reported.push(error)
  })
  return reported
}

/**
 * Records every native listener registration made while running one operation.
 *
 * @template Result
 * @param {import('jsdom').DOMWindow} window
 * @param {() => Result} operation
 * @returns {{
 *   result: Result,
 *   added: Array<{type: string, options: unknown}>,
 *   removed: Array<{type: string}>,
 * }}
 */
function recordListeners(window, operation) {
  /** @type {Array<{type: string, options: unknown}>} */
  const added = []
  /** @type {Array<{type: string}>} */
  const removed = []
  const targets = [window.Element.prototype, window.ShadowRoot.prototype]
  const originals = targets.map(target => ({
    target,
    add: target.addEventListener,
    remove: target.removeEventListener,
  }))

  for (const original of originals) {
    Reflect.set(
      original.target,
      'addEventListener',
      /**
       * @this {EventTarget}
       * @param {string} type
       * @param {EventListenerOrEventListenerObject} listener
       * @param {unknown} options
       */
      function (type, listener, options) {
        added.push({ type, options })
        return Reflect.apply(original.add, this, [type, listener, options])
      },
    )
    Reflect.set(
      original.target,
      'removeEventListener',
      /**
       * @this {EventTarget}
       * @param {string} type
       * @param {EventListenerOrEventListenerObject} listener
       * @param {unknown} options
       */
      function (type, listener, options) {
        removed.push({ type })
        return Reflect.apply(original.remove, this, [type, listener, options])
      },
    )
  }

  try {
    return { result: operation(), added, removed }
  } finally {
    for (const original of originals) {
      Reflect.set(original.target, 'addEventListener', original.add)
      Reflect.set(original.target, 'removeEventListener', original.remove)
    }
  }
}

/**
 * @template Result
 * @param {() => Result} operation
 * @returns {{ result: Result, warnings: string[] }}
 */
function recordWarnings(operation) {
  /** @type {string[]} */
  const warnings = []
  const original = console.warn

  console.warn = (/** @type {unknown[]} */ ...args) => {
    warnings.push(args.map(String).join(' '))
  }

  try {
    return { result: operation(), warnings }
  } finally {
    console.warn = original
  }
}

test('routes a component event to the closest matching element', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section>
      <button class="save" type="button"><span class="label">Save</span></button>
    </section>
  `)
  /** @type {Array<[Event, Element]>} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      on('.save', 'click', (event, element) => {
        handled.push([event, element])
      }),
    ],
  }).mount(document.createElement('div'))
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('.save')
  )
  const label = /** @type {HTMLSpanElement} */ (button.firstElementChild)
  const click = nativeEvent(window, 'click')

  label.dispatchEvent(click)

  assert.equal(handled.length, 1)
  // The original native event reaches the handler unchanged.
  assert.strictEqual(handled[0]?.[0], click)
  assert.strictEqual(handled[0]?.[1], button)
  // currentTarget stays the component routing boundary.
  assert.strictEqual(handled[0]?.[0].target, label)

  mounted.unmount()
  label.dispatchEvent(nativeEvent(window, 'click'))
  assert.equal(handled.length, 1)
})

test('exposes the routing boundary as currentTarget during dispatch', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section><button class="save" type="button">Save</button></section>
  `)
  /** @type {Array<EventTarget | null>} */
  const currentTargets = []
  const mounted = component({
    template,
    bindings: [
      on('.save', 'click', event => {
        currentTargets.push(event.currentTarget)
      }),
    ],
  }).mount(document.createElement('div'))
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('.save')
  )

  button.dispatchEvent(nativeEvent(window, 'click'))

  assert.deepEqual(currentTargets, [mounted.root])
})

test('matches the mounted component root', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, '<section class="counter"></section>')
  /** @type {Element[]} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      on('.counter', 'click', (_event, element) => {
        handled.push(element)
      }),
    ],
  }).mount(document.createElement('div'))

  mounted.root.dispatchEvent(nativeEvent(window, 'click'))

  assert.deepEqual(handled, [mounted.root])
})

test('invokes one binding once per native event and both matching bindings', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section>
      <div class="box" data-track="outer">
        <div class="box" data-track="inner">
          <button type="button">Go</button>
        </div>
      </div>
    </section>
  `)
  /** @type {string[]} */
  const order = []
  const mounted = component({
    template,
    bindings: [
      on('.box', 'click', (_event, element) => {
        order.push(`box:${element.getAttribute('data-track')}`)
      }),
      on('[data-track]', 'click', (_event, element) => {
        order.push(`track:${element.getAttribute('data-track')}`)
      }),
    ],
  }).mount(document.createElement('div'))

  mounted.root.querySelector('button')?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  // Nested matches do not repeat one binding, and declaration order holds
  // inside the shared router.
  assert.deepEqual(order, ['box:inner', 'track:inner'])
})

test('shares one native listener across compatible component bindings', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section>
      <button class="save" type="button">Save</button>
    </section>
  `)
  const { added } = recordListeners(window, () => {
    return component({
      template,
      bindings: [
        on('.save', 'click', () => {}),
        on('.delete', 'click', () => {}),
        on('.preview', 'click', () => {}, { freq: 'once' }),
        on('.audit', 'click', () => {}, { capture: true }),
        on('.viewport', 'wheel', () => {}, { passive: true }),
        on('.editor', 'wheel', () => {}),
      ],
    }).mount(document.createElement('div'))
  })

  assert.deepEqual(added, [
    { type: 'click', options: { capture: false, passive: false } },
    { type: 'click', options: { capture: true, passive: false } },
    { type: 'wheel', options: { capture: false, passive: true } },
    { type: 'wheel', options: { capture: false, passive: false } },
  ])
})

test('keeps routing elements created by later updates', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul><li class="item"><button type="button">Item</button></li></ul>
  `)
  /** @type {Element[]} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      bind('.item', (/** @type {{items: object[]}} */ data) => data.items),
      on('.item button', 'click', (_event, element) => {
        handled.push(element)
      }),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ items: [{}, {}, {}] })

  const buttons = mounted.root.querySelectorAll('button')
  buttons[2]?.dispatchEvent(nativeEvent(window, 'click'))

  assert.deepEqual(handled, [buttons[2]])
})

test('reports a routed handler error without stopping other bindings', () => {
  const { document, window } = createDocument()
  const reported = captureReportedErrors(window)
  const template = createTemplate(document, `
    <section><button class="save" type="button">Save</button></section>
  `)
  const failure = new Error('handler failed')
  /** @type {string[]} */
  const order = []
  const mounted = component({
    template,
    bindings: [
      on('.save', 'click', () => {
        order.push('first')
        throw failure
      }),
      on('button', 'click', () => {
        order.push('second')
      }),
    ],
  }).mount(document.createElement('div'))

  mounted.root.querySelector('button')?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  assert.deepEqual(order, ['first', 'second'])
  assert.deepEqual(reported, [failure])
})

test('stops remaining component bindings when a handler unmounts', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section><button class="save" type="button">Save</button></section>
  `)
  /** @type {string[]} */
  const order = []
  const mounted = component({
    template,
    bindings: [
      on('.save', 'click', () => {
        order.push('first')
        mounted.unmount()
      }),
      on('button', 'click', () => {
        order.push('second')
      }),
    ],
  }).mount(document.createElement('div'))
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('button')
  )

  button.dispatchEvent(nativeEvent(window, 'click'))

  assert.deepEqual(order, ['first'])

  button.dispatchEvent(nativeEvent(window, 'click'))
  assert.deepEqual(order, ['first'])
})

test('does not invoke a binding twice when a handler updates the component', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul><li class="item"><button type="button">Item</button></li></ul>
  `)
  /** @type {number[]} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      bind('.item', (/** @type {{items: object[]}} */ data) => data.items),
      on('button', 'click', () => {
        handled.push(mounted.root.querySelectorAll('button').length)
        mounted.update({ items: [{}, {}, {}] })
      }),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ items: [{}] })
  mounted.root.querySelector('button')?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  assert.deepEqual(handled, [1])
  assert.equal(mounted.root.querySelectorAll('button').length, 3)
})

test('does not match DOM owned by a nested component', () => {
  const { document, window } = createDocument()
  const childComponent = component({
    template: createTemplate(document, `
      <article class="profile"><button type="button">Child</button></article>
    `),
    bindings: [],
  })
  const template = createTemplate(document, `
    <section>
      <div class="slot"></div>
      <button type="button">Parent</button>
    </section>
  `)
  /** @type {string[]} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      child('.slot', childComponent, () => ({})),
      on('button', 'click', (_event, element) => {
        handled.push(element.textContent ?? '')
      }),
      on('.slot', 'click', () => {
        handled.push('container')
      }),
    ],
  }).mount(document.createElement('div'))
  const childButton = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('.slot button')
  )

  childButton.dispatchEvent(nativeEvent(window, 'click'))
  assert.deepEqual(handled, ['container'])

  const parentButton = /** @type {HTMLButtonElement} */ (
    Array.from(mounted.root.children).find(element => {
      return element.localName === 'button'
    })
  )
  parentButton.dispatchEvent(nativeEvent(window, 'click'))
  assert.deepEqual(handled, ['container', 'Parent'])
})

test('routes events inside open shadow roots exactly once', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, '<section><div class="host"></div></section>')
  /** @type {string[]} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      on('.action', 'click', (_event, element) => {
        handled.push(element.localName)
      }),
    ],
  }).mount(document.createElement('div'))
  const host = /** @type {HTMLDivElement} */ (
    mounted.root.querySelector('.host')
  )
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = '<button class="action" type="button"><span>Run</span></button>'

  // Shadow routing points are reconciled with the committed DOM.
  mounted.update({})

  const button = /** @type {HTMLButtonElement} */ (
    shadow.querySelector('.action')
  )
  button.querySelector('span')?.dispatchEvent(nativeEvent(window, 'click'))

  assert.deepEqual(handled, ['button'])

  // A non-composed event never leaves the shadow tree, and the router Lumi
  // maintains inside that tree still routes it.
  button.dispatchEvent(nativeEvent(window, 'click', { composed: false }))
  assert.deepEqual(handled, ['button', 'button'])

  mounted.unmount()
  button.dispatchEvent(nativeEvent(window, 'click'))
  assert.deepEqual(handled, ['button', 'button'])
})

test('maintains element listeners on every matching element', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul><li class="item"><video></video></li></ul>
  `)
  /** @type {Array<EventTarget | null>} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      bind('.item', (/** @type {{items: object[]}} */ data) => data.items),
      on('video', 'ended', event => {
        handled.push(event.currentTarget)
      }, { at: 'elements' }),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ items: [{}, {}] })

  const videos = Array.from(mounted.root.querySelectorAll('video'))
  assert.equal(videos.length, 2)

  // A non-bubbling event reaches a listener on the element itself.
  for (const video of videos) {
    video.dispatchEvent(nativeEvent(window, 'ended', { bubbles: false }))
  }

  assert.deepEqual(handled, videos)

  const removed = videos[1]
  mounted.update({ items: [{}] })
  removed?.dispatchEvent(nativeEvent(window, 'ended', { bubbles: false }))
  assert.equal(handled.length, 2)

  // A detached element carries no Lumi listener back into the document.
  document.body.append(/** @type {HTMLVideoElement} */ (removed))
  removed?.dispatchEvent(nativeEvent(window, 'ended', { bubbles: false }))
  assert.equal(handled.length, 2)

  mounted.unmount()
  videos[0]?.dispatchEvent(nativeEvent(window, 'ended', { bubbles: false }))
  assert.equal(handled.length, 2)
})

test('keeps element listener membership when preparation fails', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul><li class="item"><button type="button">Item</button></li></ul>
  `)
  /** @type {number} */
  let handledCount = 0
  const mounted = component({
    template,
    bindings: [
      bind(
        '.item',
        (/** @type {{items: object[], fail?: boolean}} */ data) => {
          if (data.fail === true) {
            throw new Error('projection failed')
          }
          return data.items
        },
      ),
      on('button', 'click', () => {
        handledCount += 1
      }, { at: 'elements' }),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ items: [{}, {}] })
  const buttons = Array.from(mounted.root.querySelectorAll('button'))

  assert.throws(() => mounted.update({ items: [{}], fail: true }))

  for (const button of buttons) {
    button.dispatchEvent(nativeEvent(window, 'click'))
  }

  assert.equal(handledCount, 2)
})

test('applies element attachment semantics to nested matching elements', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section class="panel"><div class="panel"><button type="button">Go</button></div></section>
  `)
  /** @type {Array<EventTarget | null>} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      on('.panel', 'click', event => {
        handled.push(event.currentTarget)
      }, { at: 'elements' }),
    ],
  }).mount(document.createElement('div'))

  mounted.root.querySelector('button')?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  // Native propagation reaches both listeners, innermost first.
  assert.deepEqual(handled, [
    mounted.root.querySelector('.panel'),
    mounted.root,
  ])
})

test('consumes a once binding for the mounted component lifetime', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul><li class="item"><button type="button">Item</button></li></ul>
  `)
  /** @type {string[]} */
  const order = []
  const definition = component({
    template,
    bindings: [
      bind('.item', (/** @type {{items: object[]}} */ data) => data.items),
      on('button', 'click', () => {
        order.push('once')
      }, { freq: 'once' }),
      on('button', 'click', () => {
        order.push('always')
      }),
    ],
  })
  const mounted = definition.mount(document.createElement('div'))

  mounted.update({ items: [{}, {}] })
  const buttons = Array.from(mounted.root.querySelectorAll('button'))

  buttons[0]?.dispatchEvent(nativeEvent(window, 'click'))
  // Another matching element does not reactivate the binding.
  buttons[1]?.dispatchEvent(nativeEvent(window, 'click'))
  // Neither does rendering a new one.
  mounted.update({ items: [{}, {}, {}] })
  mounted.root.querySelectorAll('button')[2]?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  assert.deepEqual(order, ['once', 'always', 'always', 'always'])

  // A fresh mount of the same declaration starts a fresh once lifetime.
  const remounted = definition.mount(document.createElement('div'))
  remounted.update({ items: [{}] })
  remounted.root.querySelector('button')?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  assert.deepEqual(order, ['once', 'always', 'always', 'always', 'once', 'always'])
})

test('consumes a once binding before invoking a throwing handler', () => {
  const { document, window } = createDocument()
  const reported = captureReportedErrors(window)
  const template = createTemplate(document, `
    <section><button type="button">Go</button></section>
  `)
  const failure = new Error('handler failed')
  let calls = 0
  const mounted = component({
    template,
    bindings: [
      on('button', 'click', () => {
        calls += 1
        throw failure
      }, { freq: 'once' }),
    ],
  }).mount(document.createElement('div'))
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('button')
  )

  button.dispatchEvent(nativeEvent(window, 'click'))
  button.dispatchEvent(nativeEvent(window, 'click'))

  assert.equal(calls, 1)
  assert.deepEqual(reported, [failure])
})

test('cannot reenter a consumed once binding during dispatch', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section><button type="button">Go</button></section>
  `)
  let calls = 0
  const mounted = component({
    template,
    bindings: [
      on('button', 'click', event => {
        calls += 1

        if (calls < 3) {
          /** @type {Element} */ (event.target).dispatchEvent(
            nativeEvent(window, 'click'),
          )
        }
      }, { freq: 'once' }),
    ],
  }).mount(document.createElement('div'))

  mounted.root.querySelector('button')?.dispatchEvent(
    nativeEvent(window, 'click'),
  )

  assert.equal(calls, 1)
})

test('a consumed once binding leaves sibling routes installed', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section><button type="button">Go</button></section>
  `)
  /** @type {string[]} */
  const order = []
  const mounted = component({
    template,
    bindings: [
      on('button', 'click', () => order.push('once'), { freq: 'once' }),
      on('button', 'click', () => order.push('always')),
    ],
  }).mount(document.createElement('div'))
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('button')
  )

  button.dispatchEvent(nativeEvent(window, 'click'))
  button.dispatchEvent(nativeEvent(window, 'click'))

  assert.deepEqual(order, ['once', 'always', 'always'])
})

test('removes element listeners when a once binding is consumed', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <ul><li class="item"><video></video></li></ul>
  `)
  let calls = 0
  const mounted = component({
    template,
    bindings: [
      bind('.item', (/** @type {{items: object[]}} */ data) => data.items),
      on('video', 'ended', () => {
        calls += 1
      }, { at: 'elements', freq: 'once' }),
    ],
  }).mount(document.createElement('div'))

  mounted.update({ items: [{}, {}] })
  const videos = Array.from(mounted.root.querySelectorAll('video'))

  videos[0]?.dispatchEvent(nativeEvent(window, 'ended', { bubbles: false }))
  videos[1]?.dispatchEvent(nativeEvent(window, 'ended', { bubbles: false }))

  // A later update must not reattach a consumed binding.
  mounted.update({ items: [{}, {}, {}] })
  mounted.root.querySelectorAll('video')[2]?.dispatchEvent(
    nativeEvent(window, 'ended', { bubbles: false }),
  )

  assert.equal(calls, 1)
})

test('applies capture and passive to the native listener', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section class="viewport"><button type="button">Go</button></section>
  `)
  /** @type {string[]} */
  const order = []
  const mounted = component({
    template,
    bindings: [
      on('button', 'click', () => order.push('bubble'), { at: 'elements' }),
      on('.viewport', 'click', () => order.push('capture'), {
        capture: true,
      }),
      on('.viewport', 'wheel', event => {
        event.preventDefault()
        order.push(`cancelled:${event.defaultPrevented}`)
      }, { passive: true }),
    ],
  }).mount(document.createElement('div'))
  const button = /** @type {HTMLButtonElement} */ (
    mounted.root.querySelector('button')
  )

  button.dispatchEvent(nativeEvent(window, 'click'))
  button.dispatchEvent(nativeEvent(window, 'wheel'))

  // Component capture runs before the element listener on the target.
  assert.deepEqual(order, ['capture', 'bubble', 'cancelled:false'])
})

test('preserves native cancellation for active listeners', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, '<form><button type="submit">Go</button></form>')
  const mounted = component({
    template,
    bindings: [
      on('form', 'submit', event => {
        event.preventDefault()
      }),
    ],
  }).mount(document.createElement('div'))
  const submit = nativeEvent(window, 'submit')

  mounted.root.dispatchEvent(submit)

  assert.equal(submit.defaultPrevented, true)
})

test('does not translate one native event type into another', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, '<section><input></section>')
  /** @type {string[]} */
  const handled = []
  const { result: mounted, warnings } = recordWarnings(() => {
    return component({
      template,
      bindings: [
        on('input', 'focus', () => handled.push('focus')),
        on('.card', 'mouseenter', () => handled.push('mouseenter')),
      ],
    }).mount(document.createElement('div'))
  })
  const input = /** @type {HTMLInputElement} */ (
    mounted.root.querySelector('input')
  )

  // focus is not rewritten as focusin, and the non-bubbling event does not
  // reach the component boundary.
  input.dispatchEvent(nativeEvent(window, 'focusin'))
  input.dispatchEvent(nativeEvent(window, 'focus', { bubbles: false }))

  assert.equal(handled.length, 0)
  assert.equal(warnings.length, 2)
  assert.match(warnings[0] ?? '', /"focus" normally does not bubble/)
  assert.match(warnings[0] ?? '', /\{at: "elements"\}/)
  assert.match(warnings[1] ?? '', /"mouseenter" normally does not bubble/)

  // Element attachment and intentional capture are not warned about.
  const { warnings: quiet } = recordWarnings(() => {
    on('.card', 'mouseenter', () => {}, { at: 'elements' })
    on('.card', 'mouseenter', () => {}, { capture: true })
    on('.editor', 'record-saved', () => {})
    return null
  })

  assert.deepEqual(quiet, [])
})

test('routes custom events according to their native initialization', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section><div class="editor"><span>Body</span></div></section>
  `)
  /** @type {unknown[]} */
  const handled = []
  const mounted = component({
    template,
    bindings: [
      on('.editor', 'record-saved', event => {
        handled.push(/** @type {CustomEvent} */ (event).detail)
      }),
    ],
  }).mount(document.createElement('div'))
  const editor = /** @type {HTMLDivElement} */ (
    mounted.root.querySelector('.editor')
  )

  editor.dispatchEvent(new window.CustomEvent('record-saved', {
    bubbles: true,
    composed: true,
    detail: { id: 7 },
  }))

  assert.deepEqual(handled, [{ id: 7 }])
})

test('rejects invalid event declarations', () => {
  const { document } = createDocument()

  assert.throws(
    () => on('  ', 'click', () => {}),
    /Lumi event binding selector must be a non-empty string/,
  )
  assert.throws(
    () => on('button', '', () => {}),
    /Lumi event binding on "button" requires a non-empty event type/,
  )
  assert.throws(
    () => on(
      'button',
      'click',
      /** @type {(event: Event, element: Element) => void} */ (
        /** @type {unknown} */ ('save')
      ),
    ),
    /Invalid Lumi event binding for "click" on "button": handler must be a function/,
  )
  assert.throws(
    () => on('video', 'ended', () => {}, /** @type {never} */ ({ at: 'window' })),
    /Invalid Lumi event binding for "ended" on "video": options\.at must be "component" or "elements"/,
  )
  assert.throws(
    () => on('button', 'click', () => {}, /** @type {never} */ ({ once: true })),
    /options\.once is not a supported event option; use freq: "once" for a binding-level once/,
  )
  assert.throws(
    () => on('button', 'click', () => {}, /** @type {never} */ ({ freq: 'sometimes' })),
    /options\.freq must be "always" or "once"/,
  )
  assert.throws(
    () => on('button', 'click', () => {}, /** @type {never} */ ({ capture: 'yes' })),
    /options\.capture must be a boolean/,
  )
  assert.throws(
    () => on('button', 'click', () => {}, /** @type {never} */ ({ passive: 1 })),
    /options\.passive must be a boolean/,
  )
  assert.throws(
    () => on('button', 'click', () => {}, /** @type {never} */ ({ prevent: true })),
    /options\.prevent is not a supported event option; use "at", "capture", "passive" or "freq"/,
  )
  assert.throws(
    () => on('button', 'click', () => {}, /** @type {never} */ ('capture')),
    /options must be an object/,
  )

  // An invalid selector fails component connection rather than the first event.
  const template = createTemplate(document, '<section></section>')
  const target = document.createElement('div')
  target.append(document.createElement('p'))

  assert.throws(() => component({
    template,
    bindings: [on('((', 'click', () => {})],
  }).mount(target))

  assert.equal(target.firstElementChild?.localName, 'p')
})

test('accepts a valid selector that currently has no matches', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, '<section></section>')
  let calls = 0
  const mounted = component({
    template,
    bindings: [
      on('.later', 'click', () => {
        calls += 1
      }),
    ],
  }).mount(document.createElement('div'))

  const later = document.createElement('div')
  later.className = 'later'
  mounted.root.append(later)
  later.dispatchEvent(nativeEvent(window, 'click'))

  assert.equal(calls, 1)
})

test('releases managed listeners when the component unmounts', () => {
  const { document, window } = createDocument()
  const template = createTemplate(document, `
    <section><video></video><button type="button">Go</button></section>
  `)
  const mounted = component({
    template,
    bindings: [
      on('button', 'click', () => {}),
      on('video', 'ended', () => {}, { at: 'elements' }),
    ],
  }).mount(document.createElement('div'))

  const { removed } = recordListeners(window, () => {
    mounted.unmount()
    // Unmounting twice remains a no-op.
    mounted.unmount()
    return null
  })

  assert.deepEqual(removed, [{ type: 'click' }, { type: 'ended' }])
})
