// @ts-check

/** @typedef {'overview' | 'projects' | 'records' | 'activity' | 'teams'} Route */
/** @typedef {'all' | 'active' | 'planning'} ProjectFilter */
/** @typedef {'all' | 'alpha' | 'beta' | 'gamma' | 'delta'} RecordFilter */
/** @typedef {'ascending' | 'descending'} RecordSortDirection */

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
 *   recordFilter: RecordFilter,
 *   recordSort: RecordSortDirection,
 *   now: Date,
 *   records: ReadonlyArray<{
 *     id: string,
 *     name: string,
 *     group: string,
 *     owner: string,
 *     value: number,
 *     label: string,
 *   }>,
 *   projects: readonly Project[],
 *   activities: readonly Activity[],
 *   members: readonly Member[],
 *   metrics: readonly Metric[],
 * }} PageData
 */

import {
  activities,
  documentTitle,
  memberFromHash,
  members,
  metrics,
  normalizeHash,
  projects,
  routeFromHash,
} from './data.js'
import {largeRecords} from './large-data.js'

/** @type {PageData} */
let data = {
  route: routeFromHash(window.location.hash),
  navOpen: false,
  toasts: [],
  selectedMemberId: memberFromHash(window.location.hash),
  filter: 'all',
  recordFilter: 'all',
  recordSort: 'ascending',
  now: new Date(),
  records: largeRecords,
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

  const clock = window.setInterval(() => {
    update(current => ({...current, now: new Date()}))
  }, 60_000)
  let isConnected = true

  function disconnect() {
    if (!isConnected) {
      return
    }

    window.removeEventListener('hashchange', handleHashChange)
    window.clearInterval(clock)
    page = null
    isConnected = false
  }

  window.addEventListener('hashchange', handleHashChange)

  try {
    normalizeHash()
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
