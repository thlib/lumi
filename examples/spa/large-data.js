// @ts-check

/** @typedef {'all' | 'alpha' | 'beta' | 'gamma' | 'delta'} RecordFilter */
/** @typedef {'ascending' | 'descending'} RecordSortDirection */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   group: Exclude<RecordFilter, 'all'>,
 *   owner: string,
 *   value: number,
 *   label: string,
 * }} LargeRecord
 */

export const recordFilters = Object.freeze([
  'all',
  'alpha',
  'beta',
  'gamma',
  'delta',
])

const groups = /** @type {const} */ (['alpha', 'beta', 'gamma', 'delta'])
const owners = Object.freeze([
  'Aida Loveleys',
  'Norm Barlug',
  'Freddy Fraggin',
  'Emmy Nother',
  'Fazlo Kan',
])

/** @type {ReadonlyArray<LargeRecord>} */
export const largeRecords = Array.from({length: 20_000}, (_, index) => {
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
})

/**
 * @param {RecordFilter} filter
 * @returns {ReadonlyArray<LargeRecord>}
 */
export function filterLargeRecords(filter) {
  return filter === 'all'
    ? largeRecords
    : largeRecords.filter(record => record.group === filter)
}

/**
 * The generated, zero-padded record names are already alphabetical. Preserve
 * that order for the common path and allocate only when descending is chosen.
 *
 * @param {ReadonlyArray<LargeRecord>} records
 * @param {RecordSortDirection} direction
 * @returns {ReadonlyArray<LargeRecord>}
 */
export function orderLargeRecords(records, direction) {
  return direction === 'ascending'
    ? records
    : Array.from(records).reverse()
}
