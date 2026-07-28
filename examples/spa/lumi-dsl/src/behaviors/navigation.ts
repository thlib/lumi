import {on} from '../../../../../dist/lumi.js'
import {update} from '../page'

import type {Binding} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const navigationBehaviors: ReadonlyArray<Binding<Presentation>> = [
  on<string, 'click', Presentation>(
    '[data-navigation="toggle"]',
    'click',
    () => {
      update(data => ({...data, navOpen: !data.navOpen}))
    },
  ),
  on<string, 'click', Presentation>(
    '[data-navigation="close"]',
    'click',
    () => {
      update(data => ({...data, navOpen: false}))
    },
  ),
]
