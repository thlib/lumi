import {repeat} from '../../../../../dist/lumi.js'
import {pathMatches} from './path-value'

import type {Binding} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const repeatBehavior: Binding<Presentation> = repeat<
  unknown,
  Presentation,
  unknown
>(
  '[data-repeat]',
  (context, element) => pathMatches(
    context,
    element.getAttribute('data-repeat') ?? undefined,
  ),
)
