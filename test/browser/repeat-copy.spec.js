// @ts-check

import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixture.html')
})

test('a new repeated element is a copy that has its values', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attr, classToggle, component, repeat, text } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )
    /** @type {string[]} */
    const log = []

    class CopyProbe extends HTMLElement {
      static observedAttributes = ['data-tone']

      constructor() {
        super()
        log.push(
          `construct ${this.getAttribute('data-tone')} ${this.textContent}`,
        )
      }

      /**
       * @param {string} name
       * @param {string | null} before
       * @param {string | null} after
       */
      attributeChangedCallback(name, before, after) {
        log.push(`${name} ${before} ${after}`)
      }

      connectedCallback() {
        log.push(`connect ${this.getAttribute('data-tone')} ${this.textContent}`)
      }
    }

    customElements.define('copy-probe', CopyProbe)

    const template = document.createElement('template')
    template.innerHTML = '<ul><li class="row">'
      + '<copy-probe class="probe" data-tone="none">Default</copy-probe>'
      + '<img class="image" alt=""></li></ul>'

    /** @typedef {{id: number, name: string | null, tone: string, on: boolean}} Row */
    const mounted = component({
      source: template,
      bindings: [
        repeat(
          '.row',
          ({data}) => /** @type {Row[]} */ (data),
          ({item}) => item.id,
          [
            text('.probe', ({item}) => item.name),
            attr('.probe', 'data-tone', ({item}) => item.tone),
            attr('.image', 'alt', ({item}) => item.name),
            classToggle(':scope', 'on', ({item}) => item.on),
          ],
        ),
      ],
    }).mount(/** @type {Element} */ (document.querySelector('#test-root')))

    mounted.update([{id: 1, name: 'Ada', tone: 'a', on: true}])
    log.length = 0

    // The first element is the source element. These are copies.
    mounted.update([
      {id: 1, name: 'Ada', tone: 'a', on: true},
      {id: 2, name: 'Grace', tone: 'b', on: false},
      {id: 3, name: null, tone: 'c', on: true},
    ])

    const created = [...log]

    log.length = 0
    mounted.update([
      {id: 1, name: 'Ada', tone: 'a', on: true},
      {id: 2, name: 'Hopper', tone: 'd', on: true},
      {id: 3, name: null, tone: 'c', on: true},
    ])

    return {
      created,
      changed: [...log],
      html: Array.from(mounted.root.querySelectorAll('.row'), row => row.outerHTML),
      upgraded: Array.from(
        mounted.root.querySelectorAll('.probe'),
        probe => probe instanceof CopyProbe,
      ),
    }
  })

  // The copy for the second item has its values when its constructor runs.
  // The third item has a nullish text, so its element is a copy of the
  // source. That element gets its attribute after it goes into the
  // document.
  expect(result.created).toEqual([
    'construct b Grace',
    'data-tone null b',
    'construct none Default',
    'data-tone null none',
    'connect none Default',
    'connect b Grace',
    'data-tone none c',
  ])
  expect(result.changed).toEqual(['data-tone b d'])
  expect(result.upgraded).toEqual([true, true, true])
  expect(result.html).toEqual([
    '<li class="row on"><copy-probe class="probe" data-tone="a">Ada</copy-probe><img class="image" alt="Ada"></li>',
    '<li class="row on"><copy-probe class="probe" data-tone="d">Hopper</copy-probe><img class="image" alt="Hopper"></li>',
    '<li class="row on"><copy-probe class="probe" data-tone="c">Default</copy-probe><img class="image" alt=""></li>',
  ])
})
