// @ts-check

import {resolve} from './demo-components.js'

/** @typedef {'overview' | 'projects' | 'records' | 'activity' | 'teams'} Route */
/** @typedef {{route: Route} & Record<string, any>} ApplicationData */

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
   *   mounted: import('../../../dist/types.js').MountedComponent<any>,
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
