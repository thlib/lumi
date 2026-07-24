// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {bind, component, prop} from '../src/index.js'
import {mountApplication} from '../examples/spa/application.js'
import {define} from '../examples/spa/demo-components.js'
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

test('presents and updates only the active persistent SPA page', () => {
  const window = new JSDOM().window
  const {document} = window
  /** @type {Record<string, number>} */
  const presentationCount = {}

  define('header', definition('header'))
  define('navigation', definition('navigation'))

  define('appShell', ({resolve, present}) => {
    resolve('header')
    resolve('navigation')
    present(data => {
      countPresentation('appShell')
      return {route: data.route}
    })

    return component({
      template: createTemplate(document, `
        <div class="app-shell">
          <div data-page-slot="overview" hidden></div>
          <div data-page-slot="projects" hidden></div>
          <div data-page-slot="activity" hidden></div>
          <div data-page-slot="teams" hidden></div>
        </div>
      `),
      bindings: [
        pageVisibility('overview'),
        pageVisibility('projects'),
        pageVisibility('activity'),
        pageVisibility('teams'),
      ],
    })
  })

  define('overview', definition('overview'))
  define('projects', definition('projects'))
  define('activityPage', definition('activityPage'))
  define('teams', definition('teams'))

  const target = document.createElement('div')
  const application = mountApplication(target)
  const roots = {
    overview: pageRoot('overview'),
    projects: pageRoot('projects'),
    activity: pageRoot('activity'),
    teams: pageRoot('teams'),
  }

  assert.deepEqual(
    Object.values(roots).map(root => root.textContent),
    ['Not presented', 'Not presented', 'Not presented', 'Not presented'],
  )

  application.update({route: 'overview', value: 'First'})

  assert.equal(roots.overview.textContent, 'overview: First')
  assert.equal(roots.projects.textContent, 'Not presented')
  assert.equal(presentationCount.overview, 1)
  assert.equal(presentationCount.projects, undefined)
  assert.equal(pageSlot('overview').hidden, false)
  assert.equal(pageSlot('projects').hidden, true)

  application.update({route: 'projects', value: 'Second'})

  assert.strictEqual(pageRoot('overview'), roots.overview)
  assert.strictEqual(pageRoot('projects'), roots.projects)
  assert.equal(roots.overview.textContent, 'overview: First')
  assert.equal(roots.projects.textContent, 'projects: Second')
  assert.equal(presentationCount.overview, 1)
  assert.equal(presentationCount.projects, 1)
  assert.equal(presentationCount.activityPage, undefined)
  assert.equal(presentationCount.teams, undefined)
  assert.equal(pageSlot('overview').hidden, true)
  assert.equal(pageSlot('projects').hidden, false)

  application.unmount()
  assert.equal(target.childElementCount, 0)

  /**
   * @param {string} name
   * @returns {(context: {
   *   present: (presenter: (data: any) => unknown) => void,
   * }) => import('../src/types.js').Component<any>}
   */
  function definition(name) {
    return ({present}) => {
      present(data => {
        countPresentation(name)
        return `${name}: ${data.value}`
      })

      return component({
        template: createTemplate(
          document,
          `<section data-page="${name}">Not presented</section>`,
        ),
        bindings: [bind('[data-page]', data => data)],
      })
    }
  }

  /** @param {string} name */
  function countPresentation(name) {
    presentationCount[name] = (presentationCount[name] ?? 0) + 1
  }

  /** @param {'overview' | 'projects' | 'activity' | 'teams'} route */
  function pageVisibility(route) {
    return prop(
      `[data-page-slot="${route}"]`,
      data => data.appShell.route !== route,
      'hidden',
    )
  }

  /** @param {'overview' | 'projects' | 'activity' | 'teams'} route */
  function pageSlot(route) {
    const slot = application.root.querySelector(
      `[data-page-slot="${route}"]`,
    )

    assert.ok(slot instanceof window.HTMLElement)
    return slot
  }

  /** @param {'overview' | 'projects' | 'activity' | 'teams'} route */
  function pageRoot(route) {
    const root = pageSlot(route).firstElementChild

    assert.ok(root instanceof window.HTMLElement)
    return root
  }
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
