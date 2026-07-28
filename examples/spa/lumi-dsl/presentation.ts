import {overviewDetails} from '../data'
import {
  filterLargeRecords,
  orderLargeRecords,
} from '../data-20k'

import type {
  Activity,
  Member,
  Metric,
  Project,
  Route,
  Toast,
} from '../data'
import type {PageData} from './page'

type CurrentAttribute = 'page' | false
type NavigationState = 'open' | false
type DayState = 'today' | false

interface ActivityView extends Activity {
  href: string
}

interface MemberView extends Member {
  href: string
}

interface ProjectView extends Project {
  progressLabel: string
}

interface SelectedMemberView extends Member {
  mailto: string
}

interface ActivityScope {
  activities: readonly ActivityView[]
}

interface ProjectScope {
  projects: readonly ProjectView[]
}

type RouteMap<Value> = Readonly<Record<Route, Value>>

export interface Presentation {
  activityCount: string
  activityPageScopes: readonly ActivityScope[]
  memberCount: string
  members: readonly MemberView[]
  metrics: readonly Metric[]
  navigation: RouteMap<CurrentAttribute>
  navigationExpanded: string
  navigationState: NavigationState
  overview: {
    date: string
    title: string
  }
  overviewActivityScopes: readonly ActivityScope[]
  overviewProjectScopes: readonly ProjectScope[]
  pages: RouteMap<boolean>
  projectCount: number
  projectFilters: {
    active: string
    all: string
    planning: string
  }
  projectPageScopes: readonly ProjectScope[]
  projectSummary: string
  recordFilters: {
    all: string
    alpha: string
    beta: string
    delta: string
    gamma: string
  }
  recordRows: readonly string[]
  recordSort: PageData['recordSort']
  recordSortIndicator: string
  recordSummary: string
  selectedMember: SelectedMemberView
  teamDirectoryHidden: boolean
  teamProfileHidden: boolean
  toasts: readonly Toast[]
  userInitials: string
  userName: string
  week: Readonly<Record<Weekday, DayState>>
  workspace: string
}

type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

const routes: readonly Route[] = [
  'overview',
  'projects',
  'records',
  'activity',
  'teams',
]
const weekdays: readonly Weekday[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
]

export function present(data: PageData): Presentation {
  const overview = overviewDetails(data.now)
  const projects = data.projects.map(projectView)
  const filteredProjects = projects.filter(project => {
    return data.filter === 'all'
      || project.status.toLowerCase() === data.filter
  })
  const activities = data.activities.map(activityView)
  const selectedMember = data.members.find(
    member => member.id === data.selectedMemberId,
  )
  const profileMember = selectedMember ?? data.members[0]

  if (profileMember === undefined) {
    throw new Error('The teams view requires at least one member')
  }

  const records = data.route === 'records'
    ? orderLargeRecords(
        filterLargeRecords(data.recordFilter),
        data.recordSort,
      )
    : []
  const projectSuffix = filteredProjects.length === 1
    ? 'project'
    : 'projects'

  return {
    activityCount: `${activities.length} updates`,
    activityPageScopes: [{activities}],
    memberCount: `${data.members.length} members`,
    members: data.members.map(memberView),
    metrics: data.metrics,
    navigation: routeMap(route => (
      data.route === route ? 'page' : false
    )),
    navigationExpanded: String(data.navOpen),
    navigationState: data.navOpen ? 'open' : false,
    overview: {
      date: overview.date,
      title: overview.title,
    },
    overviewActivityScopes: [{activities: activities.slice(0, 3)}],
    overviewProjectScopes: [{projects: projects.slice(0, 3)}],
    pages: routeMap(route => data.route !== route),
    projectCount: projects.length,
    projectFilters: {
      active: String(data.filter === 'active'),
      all: String(data.filter === 'all'),
      planning: String(data.filter === 'planning'),
    },
    projectPageScopes: [{projects: filteredProjects}],
    projectSummary: `${filteredProjects.length} ${projectSuffix} shown`,
    recordFilters: {
      all: String(data.recordFilter === 'all'),
      alpha: String(data.recordFilter === 'alpha'),
      beta: String(data.recordFilter === 'beta'),
      delta: String(data.recordFilter === 'delta'),
      gamma: String(data.recordFilter === 'gamma'),
    },
    recordRows: records.map(record => record.label),
    recordSort: data.recordSort,
    recordSortIndicator: data.recordSort === 'ascending' ? '↑' : '↓',
    recordSummary: `${records.length.toLocaleString('en-US')} records shown`,
    selectedMember: {
      ...profileMember,
      mailto: `mailto:${profileMember.email}`,
    },
    teamDirectoryHidden: selectedMember !== undefined,
    teamProfileHidden: selectedMember === undefined,
    toasts: data.toasts,
    userInitials: 'FF',
    userName: 'Freddy Fraggin',
    week: Object.fromEntries(weekdays.map(day => [
      day,
      overview.today === day ? 'today' : false,
    ])) as Record<Weekday, DayState>,
    workspace: 'Luminate',
  }
}

function activityView(activity: Activity): ActivityView {
  return {
    ...activity,
    href: `#/teams/${activity.personId}`,
  }
}

function memberView(member: Member): MemberView {
  return {
    ...member,
    href: `#/teams/${member.id}`,
  }
}

function projectView(project: Project): ProjectView {
  return {
    ...project,
    progressLabel: `${project.progress}%`,
  }
}

function routeMap<Value>(
  project: (route: Route) => Value,
): RouteMap<Value> {
  return Object.fromEntries(routes.map(route => [
    route,
    project(route),
  ])) as Record<Route, Value>
}
