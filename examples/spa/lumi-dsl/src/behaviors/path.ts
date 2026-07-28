import {text} from '../../../../../dist/lumi.js'
import {pathText} from './path-value'

import type {Binding} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const pathBehavior: Binding<Presentation> = text<
  unknown,
  Presentation
>(
  '[data-path]',
  (context, element) => pathText(
    context,
    element.getAttribute('data-path') ?? undefined,
    'data-path',
  ),
)
