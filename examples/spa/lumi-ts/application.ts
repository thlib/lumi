import {resolve} from './components.js'

import type {Activity, Project} from '../data.js'
import type {PageData} from './page.js'

type Route = PageData['route']
type ApplicationData = PageData

interface ComponentData {
  activityList: readonly Activity[]
  activityPage: ApplicationData
  appShell: ApplicationData
  header: ApplicationData
  navigation: ApplicationData
  overview: ApplicationData
  projectList: readonly Project[]
  projects: ApplicationData
  records: ApplicationData
  teams: ApplicationData
}

type ComponentName = keyof ComponentData

type PlanEntry = {
  [Name in ComponentName]: {
    at: string
    use: Name
    select(data: ApplicationData): ComponentData[Name]
  }
}[ComponentName]

interface MountedPlan {
  root: Element
  update(data: ApplicationData): void
  unmount(): void
}

interface MountedEntry {
  update(data: ApplicationData): void
  unmount(): void
}

const shellPlan = [
  {at: ':scope', use: 'appShell', select: data => data},
  {at: '#header', use: 'header', select: data => data},
  {at: '#sidebar', use: 'navigation', select: data => data},
] satisfies readonly PlanEntry[]

const routePlans = {
  overview: [
    {at: ':scope', use: 'overview', select: data => data},
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
    {at: ':scope', use: 'projects', select: data => data},
    {
      at: '.content',
      use: 'projectList',
      select: data => data.projects.filter(project => (
        data.filter === 'all'
        || project.status.toLowerCase() === data.filter
      )),
    },
  ],
  records: [
    {at: ':scope', use: 'records', select: data => data},
  ],
  activity: [
    {at: ':scope', use: 'activityPage', select: data => data},
    {
      at: '.activity-panel > .content',
      use: 'activityList',
      select: data => data.activities,
    },
  ],
  teams: [
    {at: ':scope', use: 'teams', select: data => data},
  ],
} satisfies Readonly<Record<Route, readonly PlanEntry[]>>

/**
 * Mounts the persistent shell and lazily retains each visited route plan.
 */
export function mountApplication(target: Element | null): MountedPlan {
  if (target === null) {
    throw new TypeError('The application requires a mount target')
  }

  const shell = mountPlan(shellPlan, target)
  const pageSlot = shell.root.querySelector('main')

  if (pageSlot === null) {
    shell.unmount()
    throw new Error('The application shell requires a page slot')
  }

  const pages: Partial<Record<Route, MountedPlan>> = {}
  let activeRoute: Route | undefined
  let isMounted = true

  return Object.freeze({
    root: shell.root,

    update(data: ApplicationData) {
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
        page?.unmount()
      }
      shell.unmount()
      isMounted = false
    },
  })
}

/**
 * Mounts a flat, ordered placement plan. Every entry names its target
 * explicitly; \`:scope\` means the target passed to this function.
 */
function mountPlan(
  plan: readonly PlanEntry[],
  target: Element,
): MountedPlan {
  const entries = effectiveEntries(plan)
  const mountedEntries: MountedEntry[] = []
  let root: Element | undefined

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
        unmount: mounted.unmount,
        update(data) {
          mounted.update(definition.present(entry.select(data)))
        },
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
      for (const entry of mountedEntries) {
        entry.update(data)
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
 */
function effectiveEntries(
  entries: readonly PlanEntry[],
): readonly PlanEntry[] {
  const lastByTarget = new Map<string, number>()

  for (let index = 0; index < entries.length; index += 1) {
    lastByTarget.set(entries[index]?.at ?? '', index)
  }

  return entries.filter((entry, index) => (
    lastByTarget.get(entry.at) === index
  ))
}

function unmountEntries(
  entries: readonly Pick<MountedEntry, 'unmount'>[],
): unknown {
  let firstError: unknown

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    try {
      entries[index]?.unmount()
    } catch (error) {
      firstError ??= error
    }
  }

  return firstError
}
