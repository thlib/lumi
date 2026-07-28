import {attr, repeat, text} from '../app.js'

import type {Project} from '../../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {ProjectListData} from '../view-data.js'

export default {
  template: document.querySelector('#project-list'),
  present: projects => ({projects}),
  bindings: [
    repeat<Project, ProjectListData>('.project-card', ({data}) => data.projects, [
      text<Project>('.status', ({item}) => item.status),
      text<Project>('.name', ({item}) => item.name),
      text<Project>('.description', ({item}) => item.description),
      text<Project>('.members', ({item}) => item.members),
      text<Project>('.due', ({item}) => item.due),
      text<Project>('.progress-label .value', ({item}) => `${item.progress}%`),
      attr<Project>('.accent', 'data-project', ({item}) => item.id),
      attr<Project>('.progress-track .bar', 'data-project', ({item}) => item.id),
      attr<Project>('.status', 'data-status', ({item}) => item.status),
    ]),
  ],
} satisfies DefinitionOptions<readonly Project[], ProjectListData>
