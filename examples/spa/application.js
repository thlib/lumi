// @ts-check

import {present, resolve} from './demo-components.js'

/** @typedef {'overview' | 'projects' | 'activity' | 'teams'} Route */
/** @typedef {{route: Route} & Record<string, unknown>} ApplicationData */
/** @typedef {import('../../src/types.js').MountedComponent<any>} Mounted */
/** @typedef {import('../../src/types.js').Component<any>} Component */

const pageNames = Object.freeze({
  overview: 'overview',
  projects: 'projects',
  activity: 'activityPage',
  teams: 'teams',
})

/**
 * Mounts the SPA's persistent shell and active page.
 *
 * Route templates remain native HTML templates. Pages are mounted lazily and
 * retained after their first visit, but only the active page is connected to
 * the document.
 *
 * @param {Element | null} target
 * @returns {{
 *   root: Element,
 *   update: (data: ApplicationData) => void,
 *   unmount: () => void,
 * }}
 */
export function mountApplication(target) {
  const shell = resolve('appShell').mount(target)
  const pageSlot = shell.root.querySelector('[data-page-slot]')
  /** @type {Record<Route, Component>} */
  const pages = /** @type {Record<Route, Component>} */ ({})
  /** @type {Partial<Record<Route, Mounted>>} */
  const mountedPages = {}
  /** @type {Route | undefined} */
  let activeRoute

  try {
    if (pageSlot === null) {
      throw new Error('The application shell requires a page slot')
    }

    for (const route of /** @type {Route[]} */ (Object.keys(pageNames))) {
      // Resolve every definition up front, without cloning inactive templates
      // into the document. Each component owns its own event declarations, so
      // mounting a page connects and releases its listeners with it.
      pages[route] = resolve(pageNames[route])
    }
  } catch (error) {
    shell.unmount()
    throw error
  }

  let isMounted = true

  return Object.freeze({
    root: shell.root,

    update(data) {
      if (!isMounted) {
        throw new Error('Cannot update an unmounted application')
      }

      const route = data.route
      const page = pages[route]

      if (page === undefined) {
        throw new Error(`Page "${route}" is not defined`)
      }

      // Calculate every selected presentation before mutating any component.
      const pagePresentation = present(pageNames[route], data)
      const shellPresentation = {
        appShell: present('appShell', data),
        header: present('header', data),
        navigation: present('navigation', data),
      }

      let activePage = mountedPages[route]

      if (activePage === undefined) {
        activePage = page.mount(pageSlot)
        mountedPages[route] = activePage
      } else if (activeRoute !== route) {
        pageSlot.replaceChildren(activePage.root)
      }
      activeRoute = route

      activePage.update(pagePresentation)
      shell.update(shellPresentation)
    },

    unmount() {
      if (!isMounted) {
        return
      }

      unmountAll(Object.values(mountedPages))
      shell.unmount()
      isMounted = false
    },
  })
}

/** @param {Mounted[]} mounted */
function unmountAll(mounted) {
  for (const component of mounted.reverse()) {
    component.unmount()
  }
}
