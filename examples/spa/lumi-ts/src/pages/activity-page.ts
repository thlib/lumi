import {text} from '../app.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {ActivityPageData} from '../view-data.js'

export default {
  template: document.querySelector('#activity-page'),
  present: data => ({count: `${data.activities.length} updates`}),
  bindings: [
    text<ActivityPageData, ActivityPageData>(
      '#activity > .heading .count',
      ({data}) => data.count,
    ),
  ],
} satisfies DefinitionOptions<PageData, ActivityPageData>
