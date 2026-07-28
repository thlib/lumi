import {attr, on, repeat, text} from '../app.js'
import {filterLargeRecords, orderLargeRecords} from '../records.js'
import {update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {RecordsData} from '../view-data.js'

export default {
  template: document.querySelector('#records-view'),
  present: data => {
    const records = orderLargeRecords(
      filterLargeRecords(data.recordFilter),
      data.recordSort,
    )

    return {
      filter: data.recordFilter,
      sort: data.recordSort,
      sortIndicator: data.recordSort === 'ascending' ? '↑' : '↓',
      rows: records.map(record => record.label),
      summary: `${records.length.toLocaleString('en-US')} records shown`,
    }
  },
  bindings: [
    repeat<string, RecordsData>('.record-row', ({data}) => data.rows, [
      text<string, RecordsData>(':scope', ({item}) => item),
    ]),
    text<RecordsData, RecordsData>('.record-summary', ({data}) => data.summary),
    text<RecordsData, RecordsData>('.record-sort-indicator', ({data}) => data.sortIndicator),
    on<string, 'click', RecordsData>('[data-record-sort]', 'click', () => {
      update(data => ({
        ...data,
        recordSort: data.recordSort === 'ascending' ? 'descending' : 'ascending',
      }))
    }),
    on<string, 'click', RecordsData>('[data-record-filter]', 'click', (_, el) => {
      const recordFilter = el.getAttribute('data-record-filter')
      if (
        recordFilter === 'all'
        || recordFilter === 'alpha'
        || recordFilter === 'beta'
        || recordFilter === 'gamma'
        || recordFilter === 'delta'
      ) {
        update(data => ({...data, recordFilter}))
      }
    }),
    attr<RecordsData, RecordsData>(
      '[data-record-filter]',
      'aria-pressed',
      ({data}, el) => String(el.getAttribute('data-record-filter') === data.filter),
    ),
    attr<RecordsData, RecordsData>('[data-record-header]', 'aria-sort', ({data}) => data.sort),
  ],
} satisfies DefinitionOptions<PageData, RecordsData>
