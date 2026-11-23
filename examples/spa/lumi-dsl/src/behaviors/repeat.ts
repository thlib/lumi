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

/**
 * `data-repeat-by-id` keeps each element with the item that has the same
 * `id` when the list changes.
 */
export const keyedRepeatBehavior: Binding<Presentation> = repeat<
  {id: unknown},
  Presentation,
  unknown
>(
  '[data-repeat-by-id]',
  (context, element) => pathMatches(
    context,
    element.getAttribute('data-repeat-by-id') ?? undefined,
  ) as Array<{id: unknown}>,
  ({item}) => item.id,
)
