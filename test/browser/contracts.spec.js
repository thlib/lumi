// @ts-check

import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixture.html')
})

test('bind and TrustedHTML properties work with Trusted Types enforced', async ({
  page,
}) => {
  await page.goto('/test/browser/fixture.html?trusted-types')
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
    'This browser does not implement Trusted Types enforcement',
  )

  const result = await page.evaluate(async () => {
    const { bind, component, prop } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const factory = Reflect.get(window, 'trustedTypes')
    const policy = Reflect.apply(
      Reflect.get(factory, 'createPolicy'),
      factory,
      [
        'lumi-browser-test',
        { createHTML: (/** @type {string} */ value) => value },
      ],
    )
    const template = /** @type {HTMLTemplateElement | null} */ (
      document.querySelector('#trusted-types-template')
    )
    const mounted = component({
      template,
      bindings: [
        bind('output', data => data.text),
        prop('.markup', data => data.markup, 'innerHTML'),
      ],
    }).mount(document.querySelector('#test-root'))
    const createHTML = Reflect.get(policy, 'createHTML')

    mounted.update({
      text: 'Bound safely',
      markup: Reflect.apply(
        createHTML,
        policy,
        ['<strong>Trusted safely</strong>'],
      ),
    })

    let unsafeError = ''

    try {
      mounted.update({
        text: 'Must not commit',
        markup: '<em>Untrusted</em>',
      })
    } catch (error) {
      unsafeError = error instanceof Error ? error.message : String(error)
    }

    return {
      text: mounted.root.querySelector('output')?.textContent,
      markup: mounted.root.querySelector('.markup')?.innerHTML,
      unsafeError,
    }
  })

  expect(result).toEqual({
    text: 'Bound safely',
    markup: '<strong>Trusted safely</strong>',
    unsafeError: 'Lumi property "innerHTML" projection must return '
      + 'TrustedHTML; received type string',
  })
})

test('an unrelated update preserves an unbound input value and focus', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { bind, component } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <form>
        <input name="draft">
        <output></output>
      </form>
    `
    /** @type {import('../../src/index.js').ComponentOptions<{ count: number }>} */
    const options = {
      template,
      bindings: [bind('output', data => data.count)],
    }
    const mounted = component(options)
      .mount(document.querySelector('#test-root'))

    mounted.update({ count: 1 })
    Reflect.set(window, 'mounted', mounted)
  })

  const input = page.locator('input')
  await input.fill('unfinished draft')
  await page.evaluate(() => Reflect.get(window, 'mounted').update({ count: 2 }))

  await expect(input).toHaveValue('unfinished draft')
  await expect(input).toBeFocused()
  await expect(page.locator('output')).toHaveText('2')
})

test('a bound input value is restored from authoritative data', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { component, prop } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = '<input name="title">'
    /** @type {import('../../src/index.js').ComponentOptions<{ title: string }>} */
    const options = {
      template,
      bindings: [prop('input', data => data.title, 'value')],
    }
    const mounted = component(options)
      .mount(document.querySelector('#test-root'))

    mounted.update({ title: 'authoritative' })
    Reflect.set(window, 'mounted', mounted)
  })

  const input = page.locator('input')
  await input.fill('browser edit')
  await page.evaluate(() => {
    Reflect.get(window, 'mounted').update({ title: 'authoritative' })
  })

  await expect(input).toHaveValue('authoritative')
  await expect(input).toBeFocused()
})

test('array append and truncation preserve surviving rows and form state', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { bind, component } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <ol>
        <li class="row">
          <label class="name"></label>
          <input>
        </li>
      </ol>
    `
    /** @type {import('../../src/index.js').ComponentOptions<{
     *   items: Array<{ name: string }>
     * }>} */
    const options = {
      template,
      bindings: [
        bind('.row', data => data.items),
        bind('.name', data => data.items.map(item => item.name)),
      ],
    }
    const mounted = component(options)
      .mount(document.querySelector('#test-root'))

    mounted.update({
      items: [{ name: 'Ada' }, { name: 'Grace' }],
    })
    Reflect.set(window, 'mounted', mounted)
    Reflect.set(window, 'originalRows', Array.from(
      mounted.root.querySelectorAll('.row'),
    ))
  })

  const inputs = page.locator('input')
  await inputs.nth(0).fill('first draft')
  await inputs.nth(1).fill('second draft')
  await page.evaluate(() => {
    Reflect.get(window, 'mounted').update({
      items: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Linus' }],
    })
  })

  await expect(page.locator('.name')).toHaveText(['Ada', 'Grace', 'Linus'])
  expect(await inputs.evaluateAll(elements => {
    return elements.map(element => Reflect.get(element, 'value'))
  })).toEqual(['first draft', 'second draft', ''])
  expect(await page.evaluate(() => {
    const rows = document.querySelectorAll('.row')
    const originals = Reflect.get(window, 'originalRows')
    return rows[0] === originals[0] && rows[1] === originals[1]
  })).toBe(true)
  await expect(inputs.nth(1)).toBeFocused()

  await inputs.nth(0).focus()
  await page.evaluate(() => {
    Reflect.get(window, 'mounted').update({
      items: [{ name: 'Ada' }],
    })
  })

  await expect(page.locator('.name')).toHaveText(['Ada'])
  expect(await inputs.evaluateAll(elements => {
    return elements.map(element => Reflect.get(element, 'value'))
  })).toEqual(['first draft'])
  await expect(inputs.nth(0)).toBeFocused()
  expect(await page.evaluate(() => {
    const originals = Reflect.get(window, 'originalRows')
    return document.querySelector('.row') === originals[0]
      && originals[1].isConnected === false
  })).toBe(true)
})

test('a custom element receives only necessary writes and one lifecycle', async ({
  page,
}) => {
  const counts = await page.evaluate(async () => {
    const lifecycle = {
      constructed: 0,
      connected: 0,
      disconnected: 0,
      propertyWrites: 0,
      attributeWrites: 0,
    }

    class ContractProbe extends HTMLElement {
      static observedAttributes = ['status']

      constructor() {
        super()
        lifecycle.constructed += 1
        /** @type {unknown} */
        this.storedValue = undefined
      }

      connectedCallback() {
        lifecycle.connected += 1
      }

      disconnectedCallback() {
        lifecycle.disconnected += 1
      }

      get value() {
        return this.storedValue
      }

      set value(/** @type {unknown} */ next) {
        lifecycle.propertyWrites += 1
        this.storedValue = next
      }

      attributeChangedCallback() {
        lifecycle.attributeWrites += 1
      }
    }

    customElements.define('contract-probe', ContractProbe)
    const { attr, component, prop } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = '<contract-probe></contract-probe>'
    /** @type {import('../../src/index.js').ComponentOptions<{
     *   value: number,
     *   status: string
     * }>} */
    const options = {
      template,
      bindings: [
        prop('contract-probe', data => data.value, 'value'),
        attr('contract-probe', 'status', data => data.status),
      ],
    }
    const mounted = component(options)
      .mount(document.querySelector('#test-root'))

    mounted.update({ value: 1, status: 'ready' })
    mounted.update({ value: 1, status: 'ready' })
    mounted.update({ value: 2, status: 'done' })
    mounted.unmount()
    return lifecycle
  })

  expect(counts).toEqual({
    constructed: 1,
    connected: 1,
    disconnected: 1,
    propertyWrites: 2,
    attributeWrites: 2,
  })
})

test('a preparation failure leaves the live form and focus unchanged', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { bind, component } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    const template = document.createElement('template')
    template.innerHTML = `
      <form>
        <input name="draft">
        <output class="first"></output>
        <output class="second"></output>
      </form>
    `
    /** @type {import('../../src/index.js').ComponentOptions<{
     *   first: string,
     *   second: string,
     *   fail: boolean
     * }>} */
    const options = {
      template,
      bindings: [
        bind('.first', data => data.first),
        bind('.second', data => {
          if (data.fail) {
            throw new Error('preparation failed')
          }
          return data.second
        }),
      ],
    }
    const mounted = component(options)
      .mount(document.querySelector('#test-root'))

    mounted.update({ first: 'before', second: 'stable', fail: false })
    Reflect.set(window, 'mounted', mounted)
    Reflect.set(window, 'liveForm', mounted.root)
  })

  const input = page.locator('input')
  await input.fill('keep this')
  const message = await page.evaluate(() => {
    try {
      Reflect.get(window, 'mounted').update({
        first: 'rejected',
        second: 'rejected',
        fail: true,
      })
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    return ''
  })

  expect(message).toBe('preparation failed')
  await expect(page.locator('.first')).toHaveText('before')
  await expect(page.locator('.second')).toHaveText('stable')
  await expect(input).toHaveValue('keep this')
  await expect(input).toBeFocused()
  expect(await page.evaluate(() => {
    return document.querySelector('form') === Reflect.get(window, 'liveForm')
  })).toBe(true)
})
