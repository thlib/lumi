import {attr, repeat, text} from '../app.js'
import {overviewDetails} from '../navigation.js'

import type {Metric} from '../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {OverviewData} from '../view-data.js'

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export default {
  present: data => ({
    ...overviewDetails(data.now),
    metrics: data.metrics,
  }),
  template: document.querySelector('#overview-view'),
  bindings: [
    text<OverviewData, OverviewData>('#overview > .heading .eyebrow', ({data}) => data.date),
    text<OverviewData, OverviewData>('#overview-title', ({data}) => data.title),
    ...weekDays.map(day => attr<OverviewData, OverviewData>(
      `.week-chart [data-day="${day}"]`,
      'data-day-state',
      ({data}) => data.today === day ? 'today' : false,
    )),
    repeat<Metric, OverviewData>('.metric-card', ({data}) => data.metrics, [
      text<Metric, OverviewData>('.label', ({item}) => item.label),
      text<Metric, OverviewData>('.value', ({item}) => item.value),
      text<Metric, OverviewData>('.change', ({item}) => item.change),
      attr<Metric, OverviewData>(':scope', 'data-direction', ({item}) => item.direction),
    ]),
  ],
} satisfies DefinitionOptions<PageData, OverviewData>
