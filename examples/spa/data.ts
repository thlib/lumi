// Static content and routing helpers shared by the framework implementations.
import content from './data-content.json'

export type Route = 'overview' | 'projects' | 'records' | 'activity' | 'teams'
export type ProjectFilter = 'all' | 'active' | 'planning'

export interface Project {
  id: string
  name: string
  description: string
  status: 'Active' | 'Planning'
  progress: number
  due: string
  accent: string
  members: string
}

export interface Activity {
  id: string
  initials: string
  tone: string
  person: string
  action: string
  target: string
  time: string
  personId: string
}

export interface Member {
  id: string
  initials: string
  tone: string
  name: string
  role: string
  email: string
  country: string
  team: string
  bio: string
}

export interface Metric {
  id: string
  label: string
  value: string
  change: string
  direction: 'positive' | 'neutral'
}

export interface Toast {
  id: string
  message: string
}

export interface AppState {
  route: Route
  navOpen: boolean
  toasts: Toast[]
  selectedMemberId: string | null
  filter: ProjectFilter
}

export interface OverviewDetails {
  title: string
  date: string
  today: string
}

interface Content {
  routeLabels: Record<Route, string>
  projects: readonly Project[]
  activities: readonly Activity[]
  members: readonly Member[]
  metrics: readonly Metric[]
}

const {
  routeLabels,
  projects,
  activities,
  members,
  metrics,
} = content as Content

export {activities, members, metrics, projects, routeLabels}

const fullDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const shortWeekday = new Intl.DateTimeFormat('en-US', {weekday: 'short'})

export function overviewDetails(now = new Date()): OverviewDetails {
  const hour = now.getHours()
  const dayPeriod = hour < 12
    ? 'morning'
    : hour < 18
      ? 'afternoon'
      : 'evening'

  return {
    title: `Good ${dayPeriod}, Freddy`,
    date: fullDate.format(now),
    today: shortWeekday.format(now),
  }
}

export function routeFromHash(hash: string): Route {
  const route = hash.replace(/^#\//, '').split(/[/?]/)[0]
  return route === 'projects'
    || route === 'records'
    || route === 'activity'
    || route === 'teams'
    ? route
    : 'overview'
}

export function memberFromHash(hash: string): string | null {
  return /^#\/teams\/([a-z0-9-]+)(?:[/?]|$)/.exec(hash)?.[1] ?? null
}

export function normalizeHash(): void {
  if (!/^#\/(overview|projects|records|activity|teams)(?:[/?]|$)/.test(location.hash)) {
    history.replaceState(null, '', '#/overview')
  }
}

export function documentTitle(route: Route, memberId: string | null): string {
  const member = members.find(item => item.id === memberId)
  return `${member?.name ?? routeLabels[route]} · Luminate`
}
