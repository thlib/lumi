// @ts-check

import {connect, present, resolve} from './demo-components.js'

/** @typedef {'overview' | 'projects' | 'activity' | 'teams'} Route */
/** @typedef {{route: Route} & Record<string, unknown>} ApplicationData */
/** @typedef {import('../../src/types.js').MountedComponent<any>} Mounted */

const pageNames = Object.freeze({
  overview: 'overview',
  projects: 'projects',
  activity: 'activityPage',
  teams: 'teams',
})

/**
 * Mounts the SPA's persistent component roots.
 *
 * Page components deliberately remain mounted for their complete lifetime,
 * but the application presents and updates only the active page.
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
  /** @type {Partial<Record<Route, Mounted>>} */
  const mountedPages = {}
  /** @type {Array<Mounted>} */
  const mountedPageList = []
  /** @type {undefined | (() => void)} */
  let disconnect

  try {
    for (const route of /** @type {Route[]} */ (Object.keys(pageNames))) {
      const slot = shell.root.querySelector(`[data-page-slot="${route}"]`)
      const mounted = resolve(pageNames[route]).mount(slot)

      mountedPages[route] = mounted
      mountedPageList.push(mounted)
    }

    disconnect = connect(shell.root)
  } catch (error) {
    unmountAll(mountedPageList)
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
      const activePage = mountedPages[route]

      if (activePage === undefined) {
        throw new Error(`Page "${route}" is not mounted`)
      }

      // Calculate every selected presentation before mutating any component.
      const pagePresentation = present(pageNames[route], data)
      const shellPresentation = {
        appShell: present('appShell', data),
        header: present('header', data),
        navigation: present('navigation', data),
      }

      // Prepare the destination while its slot is still hidden, then reveal it.
      activePage.update(pagePresentation)
      shell.update(shellPresentation)
    },

    unmount() {
      if (!isMounted) {
        return
      }

      disconnect?.()
      unmountAll(mountedPageList)
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
