// @ts-check

/** @typedef {'overview' | 'projects' | 'activity' | 'teams'} Route */
/** @typedef {'all' | 'active' | 'planning'} ProjectFilter */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   status: 'Active' | 'Planning',
 *   progress: number,
 *   due: string,
 *   accent: string,
 *   members: string,
 * }} Project
 */

/**
 * @typedef {{
 *   id: string,
 *   initials: string,
 *   tone: string,
 *   person: string,
 *   action: string,
 *   target: string,
 *   time: string,
 *   personId: string,
 * }} Activity
 */

/**
 * @typedef {{
 *   id: string,
 *   initials: string,
 *   tone: string,
 *   name: string,
 *   role: string,
 *   email: string,
 *   country: string,
 *   team: string,
 *   bio: string,
 * }} Member
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   change: string,
 *   direction: 'positive' | 'neutral',
 * }} Metric
 */

/**
 * @typedef {{
 *   id: string,
 *   message: string,
 * }} Toast
 */

/**
 * @typedef {{
 *   route: Route,
 *   navOpen: boolean,
 *   toasts: readonly Toast[],
 *   selectedMemberId: string | null,
 *   filter: ProjectFilter,
 *   projects: readonly Project[],
 *   activities: readonly Activity[],
 *   members: readonly Member[],
 *   metrics: readonly Metric[],
 * }} PageData
 */

import {
  activities,
  documentTitle,
  isKnownHash,
  memberFromHash,
  members,
  metrics,
  projects,
  routeFromHash,
} from './data.js'

/** @type {PageData} */
let data = {
  route: routeFromHash(window.location.hash),
  navOpen: false,
  toasts: [],
  selectedMemberId: memberFromHash(window.location.hash),
  filter: 'all',
  projects,
  activities,
  members,
  metrics,
}

/** @type {{update: (data: PageData) => void} | null} */
let page = null

/**
 * Connects application data and routing to the mounted application view.
 *
 * @param {{
 *   root: Element,
 *   update: (data: PageData) => void,
 *   unmount: () => void,
 * }} lumiPage
 * @returns {() => void} Disconnects routing from the application.
 */
export function connectPage(lumiPage) {
  if (page !== null) {
    throw new Error('Page is already connected')
  }

  page = lumiPage

  function handleHashChange() {
    update(dataFromCurrentHash)
    document.querySelector('main')?.focus({ preventScroll: true })
  }

  let isConnected = true

  function disconnect() {
    if (!isConnected) {
      return
    }

    window.removeEventListener('hashchange', handleHashChange)
    page = null
    isConnected = false
  }

  window.addEventListener('hashchange', handleHashChange)

  try {
    if (!isKnownHash(window.location.hash)) {
      window.history.replaceState(null, '', '#/overview')
    }

    data = dataFromCurrentHash(data)
    render()
  } catch (error) {
    disconnect()
    throw error
  }

  return disconnect
}

/** @param {PageData} current */
function dataFromCurrentHash(current) {
  return {
    ...current,
    route: routeFromHash(window.location.hash),
    navOpen: false,
    toasts: [],
    selectedMemberId: memberFromHash(window.location.hash),
  }
}

/**
 * Applies one application data transition and updates the page.
 *
 * @param {(data: PageData) => PageData} change
 */
export function update(change) {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  data = change(data)
  render()
}

function render() {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  page.update(data)
  document.title = documentTitle(data.route, data.selectedMemberId)
}
