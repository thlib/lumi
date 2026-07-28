import {attr, on, text} from '../app.js'
import {update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {NavigationData} from '../view-data.js'

export default {
  present: data => ({
    route: data.route,
    projectCount: data.projects.length,
  }),
  template: document.querySelector('#navigation-view'),
  bindings: [
    text<NavigationData, NavigationData>('.link .count', ({data}) => data.projectCount),
    on<string, 'click', NavigationData>('.link', 'click', (_, el) => {
      if (el.getAttribute('href') === window.location.hash) {
        update(data => ({...data, navOpen: false}))
      }
    }),
    attr<NavigationData, NavigationData>(
      '.link',
      'aria-current',
      ({data}, el) => (
        el.getAttribute('href') === `#/${data.route}` ? 'page' : false
      ),
    ),
  ],
} satisfies DefinitionOptions<PageData, NavigationData>
