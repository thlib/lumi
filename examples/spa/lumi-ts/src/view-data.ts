import type {
  Activity,
  Member,
  Metric,
  Project,
  Route,
  Toast,
} from '../../data.js'
import type {
  RecordFilter,
  RecordSortDirection,
} from '../../data-20k.js'

export interface ActivityListData {
  activities: readonly Activity[]
}

export interface ActivityPageData {
  count: string
}

export interface AppShellData {
  navOpen: boolean
}

export interface HeaderData {
  navOpen: boolean
  userInitials: string
  userName: string
  workspace: string
}

export interface NavigationData {
  projectCount: number
  route: Route
}

export interface OverviewData {
  date: string
  metrics: readonly Metric[]
  title: string
  today: string
}

export interface ProjectListData {
  projects: readonly Project[]
}

export interface ProjectsData {
  filter: 'all' | 'active' | 'planning'
  summary: string
}

export interface RecordsData {
  filter: RecordFilter
  rows: readonly string[]
  sort: RecordSortDirection
  sortIndicator: string
  summary: string
}

export interface TeamsData {
  hasSelectedMember: boolean
  memberCount: string
  members: readonly Member[]
  selectedMember: Member
  toasts: readonly Toast[]
}
