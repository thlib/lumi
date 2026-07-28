import {attr, on} from '../app.js'
import {update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {AppShellData} from '../view-data.js'

export default {
  present: data => ({navOpen: data.navOpen}),
  template: document.querySelector('#app-shell'),
  bindings: [
    attr<AppShellData, AppShellData>(
      '#shell',
      'data-navigation-state',
      ({data}) => data.navOpen ? 'open' : false,
    ),
    on<string, 'click', AppShellData>('#backdrop', 'click', () => {
      update(data => ({...data, navOpen: false}))
    }),
  ],
} satisfies DefinitionOptions<PageData, AppShellData>
