import {sameRecords, withRecords} from '../../records.js'
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
import {present} from './presentation'

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
import type {Presentation} from './presentation'

interface PageState extends AppState {
  activities: readonly Activity[]
  members: readonly Member[]
  metrics: readonly Metric[]
  now: Date
  projects: readonly Project[]
  recordFilter: RecordFilter
  recordSort: RecordSortDirection
}

export interface PageData extends PageState {
  records: readonly LargeRecord[]
}

interface ConnectedPage {
  root: Element
  update(data: Presentation): void
  unmount(): void
}

let data: PageState = {
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

let page: ConnectedPage | null = null

export function connectPage(lumiPage: ConnectedPage): () => void {
  if (page !== null) {
    throw new Error('Page is already connected')
  }

  page = lumiPage

  function handleHashChange(): void {
    updateState(dataFromCurrentHash)
    document.querySelector('main')?.focus({preventScroll: true})
  }

  const clock = window.setInterval(() => {
    updateState(current => ({...current, now: new Date()}))
  }, 60_000)
  let isConnected = true

  function disconnect(): void {
    if (!isConnected) {
      return
    }

    window.removeEventListener('hashchange', handleHashChange)
    window.clearInterval(clock)
    page = null
    rendered = null
    renderedRows = []
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

function dataFromCurrentHash(current: PageState): PageState {
  return {
    ...current,
    route: routeFromHash(window.location.hash),
    navOpen: false,
    toasts: [],
    selectedMemberId: memberFromHash(window.location.hash),
  }
}

export function update(change: (data: PageData) => PageData): void {
  updateState(current => {
    const previous = rendered ?? withRecords(current)
    rendered = null
    return change(previous)
  })
}

export function updateState(change: (data: PageState) => PageState): void {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  data = change(data)
  render()
}

let rendered: PageData | null = null
let renderedRows: Presentation['recordRows'] = []

function render(): void {
  if (page === null) {
    throw new Error('Page is not connected')
  }

  const next = withRecords(data)
  const reuseRecords = sameRecords(rendered, next)
  rendered = null
  const view = present(next, reuseRecords ? renderedRows : undefined)
  page.update(view)
  renderedRows = view.recordRows
  rendered = next
  document.title = documentTitle(data.route, data.selectedMemberId)
}
