import {attr, repeat, text} from '../app.js'

import type {Activity} from '../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {ActivityListData} from '../view-data.js'

export default {
  template: document.querySelector('#activity-list'),
  present: activities => ({activities}),
  bindings: [
    repeat<Activity, ActivityListData>('.activity-item', ({data}) => data.activities, [
      text<Activity, ActivityListData>('.avatar', ({item}) => item.initials),
      text<Activity, ActivityListData>('.person', ({item}) => item.person),
      text<Activity, ActivityListData>('.action', ({item}) => item.action),
      text<Activity, ActivityListData>('.target', ({item}) => item.target),
      text<Activity, ActivityListData>('time', ({item}) => item.time),
      attr<Activity, ActivityListData>('.avatar', 'data-person', ({item}) => item.personId),
      attr<Activity, ActivityListData>('.person', 'href', ({item}) => `#/teams/${item.personId}`),
    ]),
  ],
} satisfies DefinitionOptions<readonly Activity[], ActivityListData>
