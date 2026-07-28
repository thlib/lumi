import {on} from '../../../../dist/lumi.js'
import {update} from '../page'

import type {ProjectFilter} from '../../data'
import type {Binding} from '../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const projectBehaviors: ReadonlyArray<Binding<Presentation>> = [
  on<string, 'click', Presentation>(
    '[data-project-filter]',
    'click',
    (event, element) => {
      const filter = element.getAttribute('data-project-filter')

      if (isProjectFilter(filter)) {
        update(data => ({...data, filter}))
      }
    },
  ),
]

function isProjectFilter(value: string | null): value is ProjectFilter {
  return value === 'all'
    || value === 'active'
    || value === 'planning'
}
