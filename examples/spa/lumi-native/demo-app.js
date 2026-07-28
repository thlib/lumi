// @ts-check

import {component} from '../../../dist/lumi.js'
import content from '../data-content.json' with {type: 'json'}
import config from '../data-records.json' with {type: 'json'}

export {emailValidation, emailValidationMessage} from '../email-validation.js'

/** @typedef {'overview' | 'projects' | 'records' | 'activity' | 'teams'} Route */
/** @typedef {'all' | 'active' | 'planning'} ProjectFilter */
/** @typedef {'all' | 'alpha' | 'beta' | 'gamma' | 'delta'} RecordFilter */
/** @typedef {'ascending' | 'descending'} RecordSortDirection */
/** @typedef {{route: Route} & Record<string, any>} ApplicationData */

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

/** @typedef {{id: string, message: string}} Toast */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   group: Exclude<RecordFilter, 'all'>,
 *   owner: string,
 *   value: number,
 *   label: string,
 * }} LargeRecord
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
 *   records: ReadonlyArray<LargeRecord>,
 *   projects: readonly Project[],
 *   activities: readonly Activity[],
 *   members: readonly Member[],
 *   metrics: readonly Metric[],
 * }} PageData
 */

/**
 * @template [Data=any]
 * @typedef {{
 *   template: HTMLTemplateElement | null,
 *   bindings?: ReadonlyArray<import('../../../dist/lumi.js').Binding<any>>,
 *   present: (data: Data) => any,
 * }} DefinitionOptions
 */

/**
 * @typedef {{
 *   mount: (target: Element | null) => import('../../../dist/lumi.js').MountedComponent<any>,
 *   present: (data: any) => any,
 * }} Definition
 */

/**
 * @typedef {{
 *   at: string,
 *   use: string,
 *   select?: (data: ApplicationData) => any,
 * }} PlanEntry
 */

/**
 * @typedef {{
 *   root: Element,
 *   update: (data: ApplicationData) => void,
 *   unmount: () => void,
 * }} MountedPlan
 */

/** @type {Map<string, Definition>} */
const definitions = new Map()

/**
 * Registers one component's template, behavior, and presentation function.
 *
 * @param {string} name
 * @param {DefinitionOptions | (() => DefinitionOptions)} declaration
 */
export function define(name, declaration) {
  if (definitions.has(name)) {
    throw new Error(`Component "${name}" is already defined`)
  }

  const options = typeof declaration === 'function'
    ? declaration()
    : declaration
  const renderer = component(options.bindings === undefined
    ? {template: options.template}
    : {template: options.template, bindings: options.bindings})

  definitions.set(name, {
    mount: renderer.mount,
    present: options.present,
  })
}

/**
 * Resolves one previously registered component.
 *
 * @param {string} name
 * @returns {Definition}
 */
export function resolve(name) {
  const definition = definitions.get(name)

  if (definition === undefined) {
    throw new Error(`Component "${name}" is not defined`)
  }

  return definition
}

/** @type {ReadonlyArray<PlanEntry>} */
const shellPlan = [
  {at: ':scope', use: 'appShell'},
  {at: '#header', use: 'header'},
  {at: '#sidebar', use: 'navigation'},
]

/** @type {Readonly<Record<Route, ReadonlyArray<PlanEntry>>>} */
const routePlans = {
  overview: [
    {at: ':scope', use: 'overview'},
    {
      at: '.focus > .content',
      use: 'projectList',
      select: data => data.projects.slice(0, 3),
    },
    {
      at: '.activity-panel > .content',
      use: 'activityList',
      select: data => data.activities.slice(0, 3),
    },
  ],
  projects: [
    {at: ':scope', use: 'projects'},
    {
      at: '.content',
      use: 'projectList',
      select: data => {
        const projects = /** @type {Array<{status: string}>} */ (data.projects)
        return projects.filter(project => {
          return data.filter === 'all'
            || project.status.toLowerCase() === data.filter
        })
      },
    },
  ],
  records: [
    {at: ':scope', use: 'records'},
  ],
  activity: [
    {at: ':scope', use: 'activityPage'},
    {
      at: '.activity-panel > .content',
      use: 'activityList',
      select: data => data.activities,
    },
  ],
  teams: [
    {at: ':scope', use: 'teams'},
  ],
}

/**
 * Mounts the persistent shell and lazily retains each visited route plan.
 *
 * @param {Element | null} target
 * @returns {{
 *   root: Element,
 *   update: (data: ApplicationData) => void,
 *   unmount: () => void,
 * }}
 */
export function mountApplication(target) {
  if (target === null) {
    throw new TypeError('The application requires a mount target')
  }

  const shell = mountPlan(shellPlan, target)
  const pageSlot = shell.root.querySelector('main')

  if (pageSlot === null) {
    shell.unmount()
    throw new Error('The application shell requires a page slot')
  }

  /** @type {Partial<Record<Route, MountedPlan>>} */
  const pages = {}
  /** @type {Route | undefined} */
  let activeRoute
  let isMounted = true

  return Object.freeze({
    root: shell.root,

    update(data) {
      if (!isMounted) {
        throw new Error('Cannot update an unmounted application')
      }

      let page = pages[data.route]

      if (page === undefined) {
        const staging = pageSlot.ownerDocument.createElement('div')
        page = mountPlan(routePlans[data.route], staging)
        pages[data.route] = page
      }

      page.update(data)
      shell.update(data)

      if (activeRoute !== data.route) {
        pageSlot.replaceChildren(page.root)
        activeRoute = data.route
      }
    },

    unmount() {
      if (!isMounted) {
        return
      }

      for (const page of Object.values(pages).reverse()) {
        page.unmount()
      }
      shell.unmount()
      isMounted = false
    },
  })
}

/**
 * Mounts a flat, ordered placement plan. Every entry names its target
 * explicitly; `:scope` means the target passed to this function.
 *
 * @param {ReadonlyArray<PlanEntry>} plan
 * @param {Element} target
 * @returns {MountedPlan}
 */
function mountPlan(plan, target) {
  const entries = effectiveEntries(plan)
  /** @type {Array<{
   *   mounted: import('../../../dist/lumi.js').MountedComponent<any>,
   *   present: (data: any) => any,
   *   select: (data: ApplicationData) => any,
   * }>} */
  const mountedEntries = []
  /** @type {Element | undefined} */
  let root

  try {
    for (const entry of entries) {
      const placement = entry.at === ':scope'
        ? target
        : root?.querySelector(entry.at) ?? null

      if (placement === null) {
        throw new Error(`Component target "${entry.at}" was not found`)
      }

      const definition = resolve(entry.use)
      const mounted = definition.mount(placement)
      root ??= mounted.root
      mountedEntries.push({
        mounted,
        present: definition.present,
        select: entry.select ?? (data => data),
      })
    }
  } catch (error) {
    unmountEntries(mountedEntries)
    throw error
  }

  if (root === undefined) {
    throw new Error('A component plan requires a root entry')
  }

  return {
    root,

    update(data) {
      // Derive the plan's presentations before mutating any component.
      const presentations = mountedEntries.map(entry => {
        return entry.present(entry.select(data))
      })
      for (let index = 0; index < mountedEntries.length; index += 1) {
        mountedEntries[index]?.mounted.update(presentations[index])
      }
    },

    unmount() {
      const error = unmountEntries(mountedEntries)
      if (error !== undefined) {
        throw error
      }
    },
  }
}

/**
 * Applies last-target-wins before mounting, so overridden entries never gain
 * listeners or lifecycle state.
 *
 * @param {ReadonlyArray<PlanEntry>} entries
 * @returns {ReadonlyArray<PlanEntry>}
 */
function effectiveEntries(entries) {
  /** @type {Map<string, number>} */
  const lastByTarget = new Map()

  for (let index = 0; index < entries.length; index += 1) {
    lastByTarget.set(entries[index]?.at ?? '', index)
  }

  return entries.filter((entry, index) => {
    return lastByTarget.get(entry.at) === index
  })
}

/**
 * @param {ReadonlyArray<{mounted: {unmount: () => void}}>} entries
 * @returns {unknown}
 */
function unmountEntries(entries) {
  /** @type {unknown} */
  let firstError

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    try {
      entries[index]?.mounted.unmount()
    } catch (error) {
      firstError ??= error
    }
  }

  return firstError
}

const fullDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const shortWeekday = new Intl.DateTimeFormat('en-US', {weekday: 'short'})

/**
 * Returns the date-sensitive copy used by the overview page.
 *
 * @param {Date} [now]
 */
export function overviewDetails(now = new Date()) {
  const hour = now.getHours()
  const dayPeriod = hour < 12
    ? 'morning'
    : hour < 18
      ? 'afternoon'
      : 'evening'

  return Object.freeze({
    title: `Good ${dayPeriod}, Freddy`,
    date: fullDate.format(now),
    today: shortWeekday.format(now),
  })
}

/**
 * @param {string} hash
 * @returns {Route}
 */
export function routeFromHash(hash) {
  const route = hash.replace(/^#\//, '').split(/[/?]/)[0]

  return route === 'overview'
    || route === 'projects'
    || route === 'records'
    || route === 'activity'
    || route === 'teams'
    ? route
    : 'overview'
}

/** @param {string} hash */
export function memberFromHash(hash) {
  const match = /^#\/teams\/([a-z0-9-]+)(?:[/?]|$)/.exec(hash)
  return match?.[1] ?? null
}

export function normalizeHash() {
  if (!/^#\/(overview|projects|records|activity|teams)(?:[/?]|$)/.test(window.location.hash)) {
    window.history.replaceState(null, '', '#/overview')
  }
}

/**
 * @param {Route} route
 * @param {string | null} memberId
 */
export function documentTitle(route, memberId) {
  const member = content.members.find(item => item.id === memberId)
  return (member?.name ?? content.routeLabels[route]) + ' · Luminate'
}

export const recordFilters = /** @type {readonly RecordFilter[]} */ (
  config.recordFilters
)
const groups = /** @type {readonly Exclude<RecordFilter, 'all'>[]} */ (
  config.groups
)
const owners = config.owners

/** @type {ReadonlyArray<LargeRecord>} */
export const largeRecords = Array.from(
  {length: config.recordCount},
  (_, index) => {
    const number = index + 1
    const id = `record-${String(number).padStart(5, '0')}`
    const group = groups[index % groups.length] ?? 'alpha'
    const owner = owners[index % owners.length] ?? 'Aida Loveleys'
    const value = (number * 97) % 10_000
    return {
      id,
      name: `Workspace record ${String(number).padStart(5, '0')}`,
      group,
      owner,
      value,
      label: `${id} · ${group} · ${owner} · ${value}`,
    }
  },
)

/**
 * @param {RecordFilter} filter
 * @returns {ReadonlyArray<LargeRecord>}
 */
export function filterLargeRecords(filter) {
  return filter === 'all'
    ? largeRecords
    : largeRecords.filter(record => record.group === filter)
}

/**
 * The generated, zero-padded record names are already alphabetical. Preserve
 * that order for the common path and allocate only when descending is chosen.
 *
 * @param {ReadonlyArray<LargeRecord>} records
 * @param {RecordSortDirection} direction
 * @returns {ReadonlyArray<LargeRecord>}
 */
export function orderLargeRecords(records, direction) {
  return direction === 'ascending'
    ? records
    : Array.from(records).reverse()
}

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

/** @type {PageData | null} */
let data = null

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
  data ??= initialPageData()

  function handleHashChange() {
    update(dataFromCurrentHash)
    document.querySelector('main')?.focus({preventScroll: true})
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

/** @returns {PageData} */
function initialPageData() {
  return {
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
  if (page === null || data === null) {
    throw new Error('Page is not connected')
  }

  data = change(data)
  render()
}

function render() {
  if (page === null || data === null) {
    throw new Error('Page is not connected')
  }

  page.update(data)
  document.title = documentTitle(data.route, data.selectedMemberId)
}

function start() {
  connectPage(mountApplication(document.querySelector('#app')))
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    start()
  } else {
    document.addEventListener('DOMContentLoaded', start, {once: true})
  }
}
