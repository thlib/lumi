import {attr, on, text} from '../app.js'
import {update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {ProjectsData} from '../view-data.js'

export default {
  present: data => {
    const projects = data.projects.filter(project => (
      data.filter === 'all' || project.status.toLowerCase() === data.filter
    ))
    const suffix = projects.length === 1 ? 'project' : 'projects'

    return {
      filter: data.filter,
      summary: `${projects.length} ${suffix} shown`,
    }
  },
  template: document.querySelector('#projects-view'),
  bindings: [
    text<ProjectsData, ProjectsData>('.project-toolbar .summary', ({data}) => data.summary),
    on<string, 'click', ProjectsData>('[data-filter]', 'click', (_, el) => {
      const filter = el.getAttribute('data-filter')

      if (filter === 'all' || filter === 'active' || filter === 'planning') {
        update(data => ({...data, filter}))
      }
    }),
    attr<ProjectsData, ProjectsData>(
      '[data-filter]',
      'aria-pressed',
      ({data}, el) => String(el.getAttribute('data-filter') === data.filter),
    ),
  ],
} satisfies DefinitionOptions<PageData, ProjectsData>
