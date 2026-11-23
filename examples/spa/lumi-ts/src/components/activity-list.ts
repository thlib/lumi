import {attr, repeat, text} from '../app.js'

import type {Activity} from '../../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {ActivityListData} from '../view-data.js'

export default {
  source: document.querySelector('#activity-list'),
  present: activities => ({activities}),
  bindings: [
    repeat<Activity, ActivityListData>('.activity-item', ({data}) => data.activities, [
      text('.avatar', ({item}) => item.initials),
      text('.person', ({item}) => item.person),
      text('.action', ({item}) => item.action),
      text('.target', ({item}) => item.target),
      text('time', ({item}) => item.time),
      attr('.avatar', 'data-person', ({item}) => item.personId),
      attr('.person', 'href', ({item}) => `#/teams/${item.personId}`),
    ]),
  ],
} satisfies DefinitionOptions<readonly Activity[], ActivityListData>
