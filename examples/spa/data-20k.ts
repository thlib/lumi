import config from './data-records.json'

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

export const recordFilters = config.recordFilters as readonly RecordFilter[]
const groups = config.groups as readonly Exclude<RecordFilter, 'all'>[]
const owners = config.owners

export const largeRecords: readonly LargeRecord[] = Array.from(
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

export function filterLargeRecords(
  filter: RecordFilter,
): readonly LargeRecord[] {
  return filter === 'all'
    ? largeRecords
    : largeRecords.filter(record => record.group === filter)
}

export function orderLargeRecords(
  records: readonly LargeRecord[],
  direction: RecordSortDirection,
): readonly LargeRecord[] {
  return direction === 'ascending'
    ? records
    : Array.from(records).reverse()
}
