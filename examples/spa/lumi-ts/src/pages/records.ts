import {attr, on, repeat, text} from '../app.js'
import {filterLargeRecords, orderLargeRecords} from '../records.js'
import {updateState as update} from '../page.js'

import type {LargeRecord} from '../../../data-20k.js'
import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {RecordsData} from '../view-data.js'

export default {
  source: document.querySelector('#records-view'),
  present: data => {
    const records = orderLargeRecords(
      filterLargeRecords(data.recordFilter),
      data.recordSort,
    )

    return {
      filter: data.recordFilter,
      sort: data.recordSort,
      sortIndicator: data.recordSort === 'ascending' ? '↑' : '↓',
      rows: records,
      summary: `${records.length.toLocaleString('en-US')} records shown`,
    }
  },
  bindings: [
    repeat<LargeRecord, RecordsData>(
      '.record-row',
      ({data}) => data.rows,
      ({item}) => item.id,
      [text(':scope', ({item}) => item.label)],
    ),
    text('.record-summary', ({data}) => data.summary),
    text('.record-sort-indicator', ({data}) => data.sortIndicator),
    on('[data-record-sort]', 'click', () => {
      update(data => ({
        ...data,
        recordSort: data.recordSort === 'ascending' ? 'descending' : 'ascending',
      }))
    }),
    on('[data-record-filter]', 'click', (_, el) => {
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
    attr(
      '[data-record-filter]',
      'aria-pressed',
      ({data}, el) => String(el.getAttribute('data-record-filter') === data.filter),
    ),
    attr('[data-record-header]', 'aria-sort', ({data}) => data.sort),
  ],
} satisfies DefinitionOptions<PageData, RecordsData>
