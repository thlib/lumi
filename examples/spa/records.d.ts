export type RecordFilter = 'all' | 'alpha' | 'beta' | 'gamma' | 'delta'
export type RecordSortDirection = 'ascending' | 'descending'

export interface LargeRecord {
  id: string
  name: string
  group: Exclude<RecordFilter, 'all'>
  owner: string
  value: number
  label: string
}

export const recordFilters: readonly RecordFilter[]
export function getLargeRecords(): readonly LargeRecord[]
export function filterLargeRecords(filter: RecordFilter): readonly LargeRecord[]
export function orderLargeRecords(
  records: readonly LargeRecord[],
  direction: RecordSortDirection,
): readonly LargeRecord[]

export function withRecords<State extends object>(
  state: State,
): State & {records: readonly LargeRecord[]}

interface RecordsPage {
  route: string
  recordFilter: RecordFilter
  recordSort: RecordSortDirection
  records: readonly LargeRecord[]
}

export function sameRecords(previous: RecordsPage | null, next: RecordsPage): boolean
