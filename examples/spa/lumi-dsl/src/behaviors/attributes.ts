import {attr} from '../../../../../dist/lumi.js'
import {declarationPath, pathText} from './path-value'

import type {Binding} from '../../../../../dist/lumi.js'
import type {Presentation} from '../presentation'

export const attributeBehaviors: ReadonlyArray<Binding<Presentation>> = [
  pathAttribute('aria-current'),
  pathAttribute('aria-expanded'),
  pathAttribute('aria-pressed'),
  pathAttribute('aria-sort'),
  pathAttribute('data-day-state'),
  pathAttribute('data-direction'),
  pathAttribute('data-navigation-state'),
  pathAttribute('data-person'),
  pathAttribute('data-project'),
  pathAttribute('data-status'),
  pathAttribute('data-toast-id'),
  pathAttribute('href'),
]

function pathAttribute(
  target: string,
): Binding<Presentation> {
  return attr<unknown, Presentation>(
    `[data-attr^="${target}: "]`,
    target,
    (context, element) => pathText(
      context,
      declarationPath(element, 'data-attr', target),
      'data-attr',
    ),
  )
}
