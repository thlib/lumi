// @ts-check

import config from './data-records.json' with {type: 'json'}

/** @import {LargeRecord, RecordFilter, RecordSortDirection} from './records.d.ts' */

export const recordFilters = /** @type {readonly RecordFilter[]} */ (
  config.recordFilters
)
const groups = /** @type {readonly Exclude<RecordFilter, 'all'>[]} */ (
  config.groups
)
const owners = config.owners

/** @type {ReadonlyArray<LargeRecord> | undefined} */
let records

export function getLargeRecords() {
  return records ??= Array.from(
    {length: config.recordCount},
    (_, index) => {
      const number = index + 1
      const digits = String(number).padStart(5, '0')
      const id = `record-${digits}`
      const group = groups[index % groups.length] ?? 'alpha'
      const owner = owners[index % owners.length] ?? 'Aida Loveleys'
      const value = (number * 97) % 10_000
      return {
        id,
        name: `Workspace record ${digits}`,
        group,
        owner,
        value,
        // A joined label lets Chromium release the intermediate strings.
        label: [id, group, owner, value].join(' · '),
      }
    },
  )
}

/**
 * @param {RecordFilter} filter
 * @returns {ReadonlyArray<LargeRecord>}
 */
export function filterLargeRecords(filter) {
  const largeRecords = getLargeRecords()
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

const recordsProperty = {
  configurable: true,
  enumerable: true,
  get: getLargeRecords,
  /** @param {ReadonlyArray<LargeRecord>} value */
  set(value) {
    Object.defineProperty(this, 'records', {
      configurable: true, enumerable: true, writable: true, value,
    })
  },
}

/**
 * A page can read or replace its records. Copying UI state for a menu or
 * clock update does not need the dataset.
 * @template {object} State
 * @param {State} state
 * @returns {State & {records: ReadonlyArray<LargeRecord>}}
 */
export function withRecords(state) {
  const page = 'records' in state
    ? state
    : Object.defineProperty({...state}, 'records', recordsProperty)
  return /** @type {State & {records: ReadonlyArray<LargeRecord>}} */ (page)
}

/** @typedef {{route: string, recordFilter: RecordFilter, recordSort: RecordSortDirection, records: ReadonlyArray<LargeRecord>}} RecordsPage */

/**
 * @param {RecordsPage | null} previous The last page that finished rendering.
 * @param {RecordsPage} next
 */
export function sameRecords(previous, next) {
  return next.route === 'records'
    && previous?.route === 'records'
    && previous.recordFilter === next.recordFilter
    && previous.recordSort === next.recordSort
    && previous.records === next.records
}
