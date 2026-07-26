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

export const recordFilters: readonly RecordFilter[] = [
  'all',
  'alpha',
  'beta',
  'gamma',
  'delta',
]

const groups = ['alpha', 'beta', 'gamma', 'delta'] as const
const owners = [
  'Aida Loveleys',
  'Norm Barlug',
  'Freddy Fraggin',
  'Emmy Nother',
  'Fazlo Kan',
] as const

export const largeRecords: readonly LargeRecord[] = Array.from(
  {length: 20_000},
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
