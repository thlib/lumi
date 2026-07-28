import {attr, repeat, text} from '../app.js'

import type {Activity} from '../../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {ActivityListData} from '../view-data.js'

export default {
  template: document.querySelector('#activity-list'),
  present: activities => ({activities}),
  bindings: [
    repeat<Activity, ActivityListData>('.activity-item', ({data}) => data.activities, [
      text<Activity>('.avatar', ({item}) => item.initials),
      text<Activity>('.person', ({item}) => item.person),
      text<Activity>('.action', ({item}) => item.action),
      text<Activity>('.target', ({item}) => item.target),
      text<Activity>('time', ({item}) => item.time),
      attr<Activity>('.avatar', 'data-person', ({item}) => item.personId),
      attr<Activity>('.person', 'href', ({item}) => `#/teams/${item.personId}`),
    ]),
  ],
} satisfies DefinitionOptions<readonly Activity[], ActivityListData>
