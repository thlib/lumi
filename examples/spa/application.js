// @ts-check

import {resolve} from './demo-components.js'
import {mountGroup, updateGroups} from './group.js'

/** @typedef {'overview' | 'projects' | 'records' | 'activity' | 'teams'} Route */
/** @typedef {{route: Route} & Record<string, unknown>} ApplicationData */
/** @typedef {import('./group.js').MountedGroup} Mounted */
/** @typedef {import('./demo-components.js').Definition} Definition */

const pageNames = Object.freeze({
  overview: 'overview',
  projects: 'projects',
  records: 'records',
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
  const shell = resolve('appShell')
  const mountedShell = mountGroup(shell, target, {outlets: ['main']})
  const pageSlot = mountedShell.root.querySelector('main')
  /** @type {Record<Route, Definition>} */
  const pages = /** @type {Record<Route, Definition>} */ ({})
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
    mountedShell.unmount()
    throw error
  }

  let isMounted = true

  return Object.freeze({
    root: mountedShell.root,

    update(data) {
      if (!isMounted) {
        throw new Error('Cannot update an unmounted application')
      }

      const page = pages[data.route]

      if (page === undefined) {
        throw new Error(`Page "${data.route}" is not defined`)
      }

      let activePage = mountedPages[data.route]

      if (activePage === undefined) {
        // Build an unvisited route while disconnected. Its complete component
        // group prepares before it replaces the currently visible route.
        const staging = pageSlot.ownerDocument.createElement('div')
        activePage = mountGroup(page, staging)
        mountedPages[data.route] = activePage
      }

      updateGroups([activePage, mountedShell], data)

      if (activeRoute !== data.route) {
        pageSlot.replaceChildren(activePage.root)
        activeRoute = data.route
      }
    },

    unmount() {
      if (!isMounted) {
        return
      }

      unmountAll(Object.values(mountedPages))
      mountedShell.unmount()
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
