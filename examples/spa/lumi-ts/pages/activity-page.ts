import {text} from '../app.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {ActivityPageData} from '../view-data.js'

export default {
  present: data => ({count: `${data.activities.length} updates`}),
  template: document.querySelector('#activity-page'),
  bindings: [
    text<ActivityPageData, ActivityPageData>(
      '#activity > .heading .count',
      ({data}) => data.count,
    ),
  ],
} satisfies DefinitionOptions<PageData, ActivityPageData>
