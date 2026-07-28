import {attr, repeat, text} from '../app.js'

import type {Project} from '../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {ProjectListData} from '../view-data.js'

export default {
  present: projects => ({projects}),
  template: document.querySelector('#project-list'),
  bindings: [
    repeat<Project, ProjectListData>('.project-card', ({data}) => data.projects, [
      text<Project, ProjectListData>('.status', ({item}) => item.status),
      text<Project, ProjectListData>('.name', ({item}) => item.name),
      text<Project, ProjectListData>('.description', ({item}) => item.description),
      text<Project, ProjectListData>('.members', ({item}) => item.members),
      text<Project, ProjectListData>('.due', ({item}) => item.due),
      text<Project, ProjectListData>('.progress-label .value', ({item}) => `${item.progress}%`),
      attr<Project, ProjectListData>('.accent', 'data-project', ({item}) => item.id),
      attr<Project, ProjectListData>('.progress-track .bar', 'data-project', ({item}) => item.id),
      attr<Project, ProjectListData>('.status', 'data-status', ({item}) => item.status),
    ]),
  ],
} satisfies DefinitionOptions<readonly Project[], ProjectListData>
