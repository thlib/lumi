import {attr, on, text} from '../app.js'
import {update} from '../page.js'

import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {HeaderData} from '../view-data.js'

export default {
  present: data => ({
    workspace: 'Luminate',
    userName: 'Freddy Fraggin',
    userInitials: 'FF',
    navOpen: data.navOpen,
  }),
  template: document.querySelector('#header-view'),
  bindings: [
    text<HeaderData, HeaderData>('.workspace-switcher .name', ({data}) => data.workspace),
    text<HeaderData, HeaderData>('.user-menu .name', ({data}) => data.userName),
    text<HeaderData, HeaderData>('.user-menu .avatar', ({data}) => data.userInitials),
    attr<HeaderData, HeaderData>(
      '[aria-controls="navigation"]',
      'aria-expanded',
      ({data}) => String(data.navOpen),
    ),
    on<string, 'click', HeaderData>('[aria-controls="navigation"]', 'click', () => {
      update(data => ({...data, navOpen: !data.navOpen}))
    }),
  ],
} satisfies DefinitionOptions<PageData, HeaderData>
