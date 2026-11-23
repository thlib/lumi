import {attr, on, text} from '../app.js'
import {update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {NavigationData} from '../view-data.js'

export default {
  source: document.querySelector('#navigation-view'),
  present: data => ({
    route: data.route,
    projectCount: data.projects.length,
  }),
  bindings: [
    text('.link .count', ({data}) => data.projectCount),
    on('.link', 'click', (_, el) => {
      if (el.getAttribute('href') === window.location.hash) {
        update(data => ({...data, navOpen: false}))
      }
    }),
    attr(
      '.link',
      'aria-current',
      ({data}, el) => (
        el.getAttribute('href') === `#/${data.route}` ? 'page' : false
      ),
    ),
  ],
} satisfies DefinitionOptions<PageData, NavigationData>
