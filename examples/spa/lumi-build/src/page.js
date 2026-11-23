// @ts-check

import {sameRecords, withRecords} from '../../records.js'

import content from '../../data-content.json' with {type: 'json'}

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
 *   projects: readonly Project[],
 *   activities: readonly Activity[],
 *   members: readonly Member[],
 *   metrics: readonly Metric[],
 * }} PageState
 */

/** @typedef {PageState & {records: ReadonlyArray<import('../../records.js').LargeRecord>}} PageData */

import {
  documentTitle,
  memberFromHash,
  normalizeHash,
  routeFromHash,
} from './navigation.js'

const {
  activities,
  members,
  metrics,
  projects,
} = /** @type {{
 *   activities: readonly Activity[],
 *   members: readonly Member[],
 *   metrics: readonly Metric[],
 *   projects: readonly Project[],
 * }} */ (/** @type {unknown} */ (content))

/** @type {PageState} */
let data = {
  route: routeFromHash(window.location.hash),
  navOpen: false,
  toasts: [],
  selectedMemberId: memberFromHash(window.location.hash),
  filter: 'all',
  recordFilter: 'all',
  recordSort: 'ascending',
  now: new Date(),
  projects,
  activities,
  members,
  metrics,
}

/** @type {{update: (data: PageData, reuseRecords?: boolean) => void} | null} */
let page = null

/**
 * Connects application data and routing to the mounted application view.
 *
 * @param {{
 *   root: Element,
 *   update: (data: PageData, reuseRecords?: boolean) => void,
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
    updateState(dataFromCurrentHash)
    document.querySelector('main')?.focus({ preventScroll: true })
  }

  const clock = window.setInterval(() => {
    updateState(current => ({...current, now: new Date()}))
  }, 60_000)
  let isConnected = true

  function disconnect() {
    if (!isConnected) {
      return
    }

    window.removeEventListener('hashchange', handleHashChange)
    window.clearInterval(clock)
    page = null
    rendered = null
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

/** @param {PageState} current */
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
  updateState(current => {
    const previous = rendered ?? withRecords(current)
    rendered = null
    return change(previous)
  })
}

/** @param {(data: PageState) => PageState} change */
export function updateState(change) {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  data = change(data)
  render()
}

/** @type {PageData | null} */
let rendered = null

function render() {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  const next = withRecords(data)
  const reuseRecords = sameRecords(rendered, next)
  rendered = null
  page.update(next, reuseRecords)
  rendered = next
  document.title = documentTitle(data.route, data.selectedMemberId)
}
