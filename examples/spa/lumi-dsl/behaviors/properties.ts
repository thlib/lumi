import {prop} from '../../../../dist/lumi.js'
import {pathBoolean} from './path-value'

import type {Binding} from '../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const propertyBehaviors: ReadonlyArray<Binding<Presentation>> = [
  prop<unknown, Presentation, boolean>(
    '[data-hidden]',
    (context, element) => pathBoolean(
      context,
      element.getAttribute('data-hidden') ?? undefined,
      'data-hidden',
    ),
    'hidden',
  ),
]
