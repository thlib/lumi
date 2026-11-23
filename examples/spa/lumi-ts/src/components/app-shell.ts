import {attr, on} from '../app.js'
import {updateState as update} from '../page.js'
import {emailValidation} from '../../email-validation.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {AppShellData} from '../view-data.js'

export default {
  source: document.querySelector('#app-shell'),
  present: data => ({navOpen: data.navOpen}),
  bindings: [
    ...emailValidation,
    attr(
      '#shell',
      'data-navigation-state',
      ({data}) => data.navOpen ? 'open' : false,
    ),
    on('#backdrop', 'click', () => {
      update(data => ({...data, navOpen: false}))
    }),
  ],
} satisfies DefinitionOptions<PageData, AppShellData>
