import {attr, on, text} from '../app.js'
import {updateState as update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {HeaderData} from '../view-data.js'

export default {
  source: document.querySelector('#header-view'),
  present: data => ({
    workspace: 'Luminate',
    userName: 'Freddy Fraggin',
    userInitials: 'FF',
    navOpen: data.navOpen,
  }),
  bindings: [
    text('.workspace-switcher .name', ({data}) => data.workspace),
    text('.user-menu .name', ({data}) => data.userName),
    text('.user-menu .avatar', ({data}) => data.userInitials),
    attr(
      '[aria-controls="navigation"]',
      'aria-expanded',
      ({data}) => String(data.navOpen),
    ),
    on('[aria-controls="navigation"]', 'click', () => {
      update(data => ({...data, navOpen: !data.navOpen}))
    }),
  ],
} satisfies DefinitionOptions<PageData, HeaderData>
