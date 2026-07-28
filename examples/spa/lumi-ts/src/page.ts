import {
  activities,
  documentTitle,
  members,
  memberFromHash,
  metrics,
  normalizeHash,
  projects,
  routeFromHash,
} from '../../data'
import {largeRecords} from '../../data-20k'

import type {
  Activity,
  AppState,
  Member,
  Metric,
  Project,
} from '../../data'
import type {
  LargeRecord,
  RecordFilter,
  RecordSortDirection,
} from '../../data-20k'

export interface PageData extends AppState {
  activities: readonly Activity[]
  members: readonly Member[]
  metrics: readonly Metric[]
  now: Date
  projects: readonly Project[]
  recordFilter: RecordFilter
  records: readonly LargeRecord[]
  recordSort: RecordSortDirection
}

interface ConnectedPage {
  root: Element
  update(data: PageData): void
  unmount(): void
}

let data: PageData = {
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

let page: ConnectedPage | null = null

export function connectPage(lumiPage: ConnectedPage): () => void {
  if (page !== null) {
    throw new Error('Page is already connected')
  }

  page = lumiPage

  function handleHashChange(): void {
    update(dataFromCurrentHash)
    document.querySelector('main')?.focus({preventScroll: true})
  }

  const clock = window.setInterval(() => {
    update(current => ({...current, now: new Date()}))
  }, 60_000)
  let isConnected = true

  function disconnect(): void {
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

function dataFromCurrentHash(current: PageData): PageData {
  return {
    ...current,
    route: routeFromHash(window.location.hash),
    navOpen: false,
    toasts: [],
    selectedMemberId: memberFromHash(window.location.hash),
  }
}

export function update(change: (data: PageData) => PageData): void {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  data = change(data)
  render()
}

function render(): void {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  page.update(data)
  document.title = documentTitle(data.route, data.selectedMemberId)
}
