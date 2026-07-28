import {on} from '../../../../../dist/lumi.js'
import {update} from '../page'

import type {RecordFilter} from '../../../data-20k'
import type {Binding} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const recordBehaviors: ReadonlyArray<Binding<Presentation>> = [
  on<string, 'click', Presentation>(
    '[data-record-sort="toggle"]',
    'click',
    () => {
      update(data => ({
        ...data,
        recordSort: data.recordSort === 'ascending'
          ? 'descending'
          : 'ascending',
      }))
    },
  ),
  on<string, 'click', Presentation>(
    '[data-record-filter]',
    'click',
    (event, element) => {
      const recordFilter = element.getAttribute('data-record-filter')

      if (isRecordFilter(recordFilter)) {
        update(data => ({...data, recordFilter}))
      }
    },
  ),
]

function isRecordFilter(value: string | null): value is RecordFilter {
  return value === 'all'
    || value === 'alpha'
    || value === 'beta'
    || value === 'gamma'
    || value === 'delta'
}
