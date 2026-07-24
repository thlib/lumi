// @ts-check

import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixture.html')
})

test('bindings plan and render through an open shadow root', async ({
  page,
}) => {
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
            <output class="value">Default</output>
          </section>
        `
      }
    }

    customElements.define('shadow-contract', ShadowContract)
    const { bind, component, prop } = /** @type {typeof import('../../src/index.js')} */ (
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
    template.innerHTML = '<shadow-contract></shadow-contract>'
    const mounted = component({
      template,
      bindings: [
        prop(
          '.shell',
          () => Reflect.apply(
            Reflect.get(policy, 'createHTML'),
            policy,
            ['<output class="value">Planned</output>'],
          ),
          'innerHTML',
        ),
        bind('.value', data => data),
      ],
    }).mount(document.querySelector('#test-root'))

    mounted.update('First')
    const output = mounted.root.shadowRoot?.querySelector('.value')
    mounted.update('Second')

    return {
      constructions,
      text: output?.textContent,
      persistent: mounted.root.shadowRoot?.querySelector('.value') === output,
    }
  })

  expect(result).toEqual({
    constructions: 1,
    text: 'Second',
    persistent: true,
  })
})

test('events delegate through open shadow roots and clean up', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    class ShadowEventContract extends HTMLElement {
      constructor() {
        super()
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
          <button class="action" type="button"><span>Run</span></button>
        `
      }
    }

    customElements.define('shadow-event-contract', ShadowEventContract)
    const { component, event } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = '<shadow-event-contract></shadow-event-contract>'
    /** @type {Array<{type: string, tag: string}>} */
    const handled = []
    const mounted = component({
      template,
      bindings: [
        event('.action', 'click', (nativeEvent, element) => {
          handled.push({
            type: nativeEvent.type,
            tag: element.localName,
          })
        }),
      ],
    }).mount(document.querySelector('#test-root'))
    const button = /** @type {HTMLButtonElement} */ (
      mounted.root.shadowRoot?.querySelector('.action')
    )

    button.querySelector('span')?.click()
    mounted.unmount()
    button.click()

    return handled
  })

  expect(result).toEqual([{ type: 'click', tag: 'button' }])
})
