// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {component, repeat, text} from '../src/index.js'
import {mountApplication} from '../examples/spa/application.js'
import {define, resolve} from '../examples/spa/demo-components.js'
import {mountGroup} from '../examples/spa/group.js'
import { emailValidationMessage } from '../examples/spa/validation.js'

test('describes the invite email validity state', () => {
  const { document } = new JSDOM().window
  const input = document.createElement('input')
  input.type = 'email'
  input.required = true

  assert.equal(
    emailValidationMessage(input),
    'Enter an email address.',
  )

  input.value = 'not-an-email'
  assert.equal(
    emailValidationMessage(input),
    'Enter a valid email address.',
  )

  input.value = 'person@example.com'
  assert.equal(emailValidationMessage(input), '')
})

test('disconnects SPA routing before unmount and permits reconnection', async () => {
  const dom = new JSDOM('<main tabindex="-1"></main>', {
    url: 'https://example.test/#/overview',
  })
  const globals = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  }

  Object.defineProperties(globalThis, {
    window: {configurable: true, value: dom.window},
    document: {configurable: true, value: dom.window.document},
  })

  try {
    const {connectPage} = await import('../examples/spa/page.js')
    let firstUpdateCount = 0
    let secondUpdateCount = 0
    /** @type {string | undefined} */
    let secondRoute
    const firstApplication = {
      root: dom.window.document.body,
      update() {
        firstUpdateCount += 1
      },
      unmount() {},
    }
    const secondApplication = {
      root: dom.window.document.body,
      /** @param {{route: string}} data */
      update(data) {
        secondUpdateCount += 1
        secondRoute = data.route
      },
      unmount() {},
    }

    const disconnectFirst = connectPage(firstApplication)
    assert.equal(firstUpdateCount, 1)

    disconnectFirst()
    firstApplication.unmount()
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))
    assert.equal(firstUpdateCount, 1)

    dom.window.history.replaceState(null, '', '#/projects')
    const disconnectSecond = connectPage(secondApplication)
    assert.equal(secondUpdateCount, 1)
    assert.equal(secondRoute, 'projects')

    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))
    assert.equal(secondUpdateCount, 2)
    assert.equal(firstUpdateCount, 1)

    disconnectSecond()
    disconnectSecond()
  } finally {
    restoreGlobal('window', globals.window)
    restoreGlobal('document', globals.document)
    dom.window.close()
  }
})

test('keeps only the active SPA page connected to the document', () => {
  const window = new JSDOM().window
  const {document} = window
  /** @type {Record<string, number>} */
  const presentationCount = {}

  define('header', definition('header'))
  define('navigation', definition('navigation'))

  define('appShell', () => {
    const header = /** @type {import('../examples/spa/demo-components.js').LeafDefinition} */ (
      resolve('header')
    )
    const navigation = /** @type {import('../examples/spa/demo-components.js').LeafDefinition} */ (
      resolve('navigation')
    )

    return {
      present(data) {
        countPresentation('appShell')
        return {
          route: data.route,
          header: header.present(data),
          navigation: navigation.present(data),
        }
      },

      component: component({
        template: createTemplate(document, `
          <div id="shell">
            <main></main>
          </div>
        `),
      }),
    }
  })

  define('overview', definition('overview'))
  define('projects', definition('projects'))
  define('records', definition('records'))
  define('activityPage', definition('activityPage'))
  define('teams', definition('teams'))

  const target = document.createElement('div')
  const application = mountApplication(target)
  assert.equal(pageSlot().childElementCount, 0)

  application.update({route: 'overview', value: 'First'})

  const overviewRoot = pageRoot()
  assert.equal(overviewRoot.textContent, 'overview: First')
  assert.equal(presentationCount.overview, 1)
  assert.equal(presentationCount.projects, undefined)

  application.update({route: 'overview', value: 'Updated'})

  assert.strictEqual(pageRoot(), overviewRoot)
  assert.equal(overviewRoot.textContent, 'overview: Updated')
  assert.equal(presentationCount.overview, 2)

  application.update({route: 'projects', value: 'Second'})

  const projectsRoot = pageRoot()
  assert.notStrictEqual(projectsRoot, overviewRoot)
  assert.equal(overviewRoot.isConnected, false)
  assert.equal(projectsRoot.textContent, 'projects: Second')
  assert.equal(presentationCount.overview, 2)
  assert.equal(presentationCount.projects, 1)
  assert.equal(presentationCount.activityPage, undefined)
  assert.equal(presentationCount.records, undefined)
  assert.equal(presentationCount.teams, undefined)
  assert.equal(pageSlot().childElementCount, 1)

  application.update({route: 'overview', value: 'Again'})

  assert.strictEqual(pageRoot(), overviewRoot)
  assert.equal(overviewRoot.textContent, 'overview: Again')
  assert.equal(projectsRoot.isConnected, false)
  assert.equal(presentationCount.overview, 3)

  application.unmount()
  assert.equal(target.childElementCount, 0)

  /**
   * @param {string} name
   * @returns {() => import('../examples/spa/demo-components.js').Definition}
   */
  function definition(name) {
    return () => ({
      present(data) {
        countPresentation(name)
        return `${name}: ${data.value}`
      },

      component: component({
        template: createTemplate(
          document,
          `<section data-page="${name}">Not presented</section>`,
        ),
        bindings: [text('[data-page]', ({data}) => data)],
      }),
    })
  }

  /** @param {string} name */
  function countPresentation(name) {
    presentationCount[name] = (presentationCount[name] ?? 0) + 1
  }

  function pageSlot() {
    const slot = application.root.querySelector('main')

    assert.ok(slot instanceof window.HTMLElement)
    return slot
  }

  function pageRoot() {
    const root = pageSlot().firstElementChild

    assert.ok(root instanceof window.HTMLElement)
    return root
  }
})

test('composes independently reusable components with isolated DOM ownership', () => {
  const window = new JSDOM().window
  const {document} = window
  /** @type {import('../examples/spa/demo-components.js').Definition<any>} */
  const list = {
    present: data => data,
    component: component({
      template: createTemplate(
        document,
        '<ul class="list"><li class="item">Default</li></ul>',
      ),
      bindings: [
        repeat('.item', ({data}) => data, [
          text(':scope', ({item}) => item),
        ]),
      ],
    }),
  }
  let overriddenConnections = 0
  /** @type {import('../examples/spa/demo-components.js').Definition<any>} */
  const overridden = {
    present: data => data,
    component: component({
      template: createTemplate(document, '<p class="overridden">Wrong</p>'),
      bindings: [{
        connect() {
          overriddenConnections += 1
          return {
            prepare() {
              return {commit() {}}
            },
            destroy() {},
          }
        },
      }],
    }),
  }
  /** @type {import('../examples/spa/demo-components.js').Definition<any>} */
  const page = {
    components: [
      {
        present: data => data.title,
        component: component({
          template: createTemplate(document, `
            <section>
              <h1 class="title">Default</h1>
              <div class="list-slot"></div>
            </section>
          `),
          bindings: [
            text('.title', ({data}) => data),
            // This selector must not cross the planned component boundary.
            text('.item', () => 'Owned by the page'),
          ],
        }),
      },
      {at: '.list-slot', use: overridden},
      {
        at: '.list-slot',
        use: list,
        select: data => data.items,
      },
    ],
  }
  const target = document.createElement('div')
  const mounted = mountGroup(page, target)

  mounted.update({title: 'Projects', items: ['One', 'Two']})

  assert.equal(mounted.root.querySelector('.title')?.textContent, 'Projects')
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.item'), item => item.textContent),
    ['One', 'Two'],
  )
  assert.equal(overriddenConnections, 0)

  mounted.update({title: 'Updated', items: ['Three']})

  assert.equal(mounted.root.querySelector('.title')?.textContent, 'Updated')
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.item'), item => item.textContent),
    ['Three'],
  )

  mounted.unmount()
  assert.equal(target.childElementCount, 0)
  window.close()
})

test('prepares every component group member before committing any member', () => {
  const window = new JSDOM().window
  const {document} = window
  /** @type {import('../examples/spa/demo-components.js').Definition<any>} */
  const detail = {
    present: data => data,
    component: component({
      template: createTemplate(document, '<p class="detail">Default</p>'),
      bindings: [
        text('.detail', ({data}) => {
          if (data === 'Rejected') {
            throw new Error('Rejected detail')
          }

          return data
        }),
      ],
    }),
  }
  /** @type {import('../examples/spa/demo-components.js').Definition<any>} */
  const page = {
    components: [
      {
        present: data => data.title,
        component: component({
          template: createTemplate(document, `
            <section>
              <h1 class="title">Default</h1>
              <div class="detail-slot"></div>
            </section>
          `),
          bindings: [text('.title', ({data}) => data)],
        }),
      },
      {
        at: '.detail-slot',
        use: detail,
        select: data => data.detail,
      },
    ],
  }
  const target = document.createElement('div')
  const mounted = mountGroup(page, target)

  mounted.update({title: 'Before', detail: 'Ready'})

  assert.throws(
    () => mounted.update({title: 'Must not commit', detail: 'Rejected'}),
    /Rejected detail/,
  )
  assert.equal(mounted.root.querySelector('.title')?.textContent, 'Before')
  assert.equal(mounted.root.querySelector('.detail')?.textContent, 'Ready')

  mounted.update({title: 'After', detail: 'Recovered'})

  assert.equal(mounted.root.querySelector('.title')?.textContent, 'After')
  assert.equal(mounted.root.querySelector('.detail')?.textContent, 'Recovered')

  mounted.unmount()
  window.close()
})

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
 * @param {'window' | 'document'} name
 * @param {PropertyDescriptor | undefined} descriptor
 */
function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) {
    delete globalThis[name]
  } else {
    Object.defineProperty(globalThis, name, descriptor)
  }
}
