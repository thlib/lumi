// @ts-check

import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixture.html')
})

test('bindings stop at an open shadow root', async ({ page }) => {
  const supportsTrustedTypes = await page.evaluate(() => {
    const factory = Reflect.get(window, 'trustedTypes')
    return (
      typeof factory === 'object'
      && factory !== null
      && typeof Reflect.get(factory, 'createPolicy') === 'function'
    )
  })
  test.skip(
    !supportsTrustedTypes,
    'TrustedHTML property bindings require the Trusted Types API',
  )

  const result = await page.evaluate(async () => {
    let constructions = 0

    class ShadowContract extends HTMLElement {
      constructor() {
        super()
        constructions += 1
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
          <section class="shell">
            <output class="value">Private</output>
            <slot></slot>
          </section>
        `
      }
    }

    customElements.define('shadow-contract', ShadowContract)
    const { component, prop, repeat, text } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const factory = Reflect.get(window, 'trustedTypes')
    const policy = Reflect.apply(
      Reflect.get(factory, 'createPolicy'),
      factory,
      [
        'lumi-shadow-test',
        { createHTML: (/** @type {string} */ value) => value },
      ],
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <section>
        <shadow-contract><b class="value">Slotted</b></shadow-contract>
        <div class="shell"></div>
      </section>
    `
    const mounted = component({
      source: template,
      bindings: [
        // This write changes the later matches, so the plan uses a copy.
        prop(
          '.shell',
          () => Reflect.apply(
            Reflect.get(policy, 'createHTML'),
            policy,
            ['<output class="value">Planned</output>'],
          ),
          'innerHTML',
        ),
        text('.value', ({data}) => /** @type {string} */ (data)),
      ],
    }).mount(document.querySelector('#test-root'))
    const shadow = mounted.root.querySelector('shadow-contract')?.shadowRoot
    const privateMarkup = shadow?.innerHTML

    mounted.update('First')
    const output = mounted.root.querySelector('output')
    mounted.update('Second')
    // The copy for the plan does not construct the custom element again.
    const constructionsAfterPlans = constructions

    // Each repeated element attaches its own shadow root, and the bindings
    // of the repeat stop at that shadow root.
    const listTemplate = document.createElement('template')
    listTemplate.innerHTML = `
      <ul><li><shadow-contract><b class="value"></b></shadow-contract></li></ul>
    `
    const list = component({
      source: listTemplate,
      bindings: [
        repeat(
          'li',
          ({data}) => /** @type {string[]} */ (data),
          ({item}) => item,
          [text('.value', ({item}) => /** @type {string} */ (item))],
        ),
      ],
    }).mount(document.createElement('div'))
    document.body.append(/** @type {Element} */ (list.root.parentElement))
    list.update(['Ada', 'Grace'])

    return {
      constructionsAfterPlans,
      values: Array.from(
        mounted.root.querySelectorAll('.value'),
        element => element.textContent,
      ),
      persistent: mounted.root.querySelector('output') === output,
      privateUnchanged: shadow?.innerHTML === privateMarkup,
      rows: Array.from(list.root.querySelectorAll('shadow-contract'), card => {
        return [
          card.querySelector('.value')?.textContent,
          card.shadowRoot?.querySelector('.value')?.textContent,
        ]
      }),
    }
  })

  expect(result).toEqual({
    constructionsAfterPlans: 1,
    values: ['Second', 'Second'],
    persistent: true,
    privateUnchanged: true,
    rows: [['Ada', 'Private'], ['Grace', 'Private']],
  })
})

test('component events from a shadow tree match the component tree only', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    class ShadowEventContract extends HTMLElement {
      constructor() {
        super()
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
          <button class="action private" type="button"><span>Run</span></button>
          <slot></slot>
        `
      }
    }

    customElements.define('shadow-event-contract', ShadowEventContract)
    const { component, on } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <shadow-event-contract>
        <button class="action slotted" type="button">Slotted</button>
      </shadow-event-contract>
    `
    /** @type {string[]} */
    const handled = []
    const mounted = component({
      source: template,
      bindings: [
        on('.action', 'click', (_nativeEvent, element) => {
          handled.push(element.className)
        }),
        on('shadow-event-contract', 'click', (nativeEvent, element) => {
          handled.push(
            `${element.localName} from ${
              /** @type {Element} */ (nativeEvent.target).localName
            }`,
          )
        }),
      ],
    }).mount(document.querySelector('#test-root'))
    const privateButton = /** @type {HTMLButtonElement} */ (
      mounted.root.shadowRoot?.querySelector('.action')
    )
    const slottedButton = /** @type {HTMLButtonElement} */ (
      mounted.root.querySelector('.slotted')
    )

    // The component sees the host, not the private button.
    privateButton.querySelector('span')?.click()
    // An event that is not composed stays in the shadow tree.
    privateButton.dispatchEvent(new Event('click', { bubbles: true }))
    // Slotted content is in the tree of the component.
    slottedButton.click()
    mounted.unmount()
    privateButton.click()

    return handled
  })

  expect(result).toEqual([
    'shadow-event-contract from shadow-event-contract',
    'action slotted',
    'shadow-event-contract from button',
  ])
})

test('a component renders inside a shadow root that the author owns', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { component, on, repeat, text } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <section>
        <h2 class="title"></h2>
        <ul><li><button type="button"></button></li></ul>
      </section>
    `
    /** @type {string[]} */
    const handled = []
    const view = component({
      source: template,
      bindings: [
        text('.title', ({data}) => {
          return /** @type {{title: string}} */ (data).title
        }),
        repeat(
          'li',
          ({data}) => /** @type {{items: string[]}} */ (data).items,
          ({item}) => item,
          [text('button', ({item}) => /** @type {string} */ (item))],
        ),
        on('button', 'click', (_nativeEvent, element) => {
          handled.push(element.textContent ?? '')
        }),
      ],
    })

    class OwnedView extends HTMLElement {
      constructor() {
        super()
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = '<style>h2 { color: rgb(1, 2, 3) }</style><div></div>'
        this.mounted = view.mount(shadow.lastElementChild)
      }
    }

    customElements.define('owned-view', OwnedView)
    const host = /** @type {OwnedView} */ (document.createElement('owned-view'))
    const shadow = /** @type {ShadowRoot} */ (host.shadowRoot)
    document.querySelector('#test-root')?.append(host)
    host.mounted.update({ title: 'Team', items: ['Ada', 'Grace'] })

    const title = /** @type {Element} */ (shadow.querySelector('.title'))
    const buttons = shadow.querySelectorAll('button')
    buttons[1]?.click()
    // The component root is in the shadow tree, so an event that is not
    // composed reaches the component.
    buttons[0]?.dispatchEvent(new Event('click', { bubbles: true }))

    return {
      title: title.textContent,
      // The style of the shadow root applies to the component.
      color: getComputedStyle(title).color,
      buttons: Array.from(buttons, button => button.textContent),
      handled,
      outside: document.querySelector('.title') === null,
    }
  })

  expect(result).toEqual({
    title: 'Team',
    color: 'rgb(1, 2, 3)',
    buttons: ['Ada', 'Grace'],
    handled: ['Grace', 'Ada'],
    outside: true,
  })
})

test('a component mounts on a shadow root', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { component, on, repeat, text } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <section>
        <h2 class="title"></h2>
        <ul><li><button type="button"></button></li></ul>
      </section>
    `
    /** @type {string[]} */
    const handled = []
    const view = component({
      source: template,
      bindings: [
        text('.title', ({data}) => {
          return /** @type {{title: string}} */ (data).title
        }),
        repeat(
          'li',
          ({data}) => /** @type {{items: string[]}} */ (data).items,
          ({item}) => item,
          [text('button', ({item}) => /** @type {string} */ (item))],
        ),
        on('button', 'click', (_nativeEvent, element) => {
          handled.push(element.textContent ?? '')
        }),
      ],
    })
    const styles = new CSSStyleSheet()
    styles.replaceSync('h2 { color: rgb(1, 2, 3) }')

    class RootView extends HTMLElement {
      constructor() {
        super()
        // A closed shadow root is available only to its author.
        this.shadow = this.attachShadow({ mode: 'closed' })
        // A mount replaces the child nodes of its target. An adopted style
        // sheet is not a child node, so it stays.
        this.shadow.adoptedStyleSheets = [styles]
        this.mounted = view.mount(this.shadow)
      }
    }

    customElements.define('root-view', RootView)
    const host = /** @type {RootView} */ (document.createElement('root-view'))
    document.querySelector('#test-root')?.append(host)
    host.mounted.update({ title: 'Team', items: ['Ada', 'Grace'] })

    const title = /** @type {Element} */ (host.shadow.querySelector('.title'))
    const buttons = host.shadow.querySelectorAll('button')
    buttons[1]?.click()
    // The component root is in the shadow tree, so an event that is not
    // composed reaches the component.
    buttons[0]?.dispatchEvent(new Event('click', { bubbles: true }))

    const before = {
      rootParent: host.mounted.root.parentNode === host.shadow,
      title: title.textContent,
      color: getComputedStyle(title).color,
      buttons: Array.from(buttons, button => button.textContent),
      handled: [...handled],
      outside: document.querySelector('.title') === null,
    }

    host.mounted.unmount()

    return { ...before, childNodesAfterUnmount: host.shadow.childNodes.length }
  })

  expect(result).toEqual({
    rootParent: true,
    title: 'Team',
    color: 'rgb(1, 2, 3)',
    buttons: ['Ada', 'Grace'],
    handled: ['Grace', 'Ada'],
    outside: true,
    childNodesAfterUnmount: 0,
  })
})
