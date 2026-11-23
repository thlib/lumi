import {attr, repeat, text} from '../app.js'

import type {Project} from '../../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {ProjectListData} from '../view-data.js'

export default {
  source: document.querySelector('#project-list'),
  present: projects => ({projects}),
  bindings: [
    repeat<Project, ProjectListData>('.project-card', ({data}) => data.projects, [
      text('.status', ({item}) => item.status),
      text('.name', ({item}) => item.name),
      text('.description', ({item}) => item.description),
      text('.members', ({item}) => item.members),
      text('.due', ({item}) => item.due),
      text('.progress-label .value', ({item}) => `${item.progress}%`),
      attr('.accent', 'data-project', ({item}) => item.id),
      attr('.progress-track .bar', 'data-project', ({item}) => item.id),
      attr('.status', 'data-status', ({item}) => item.status),
    ]),
  ],
} satisfies DefinitionOptions<readonly Project[], ProjectListData>
