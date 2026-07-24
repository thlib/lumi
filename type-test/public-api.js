// @ts-check

import {
  attr,
  bind,
  classToggle,
  component,
  event,
  prop,
  style,
} from '../src/index.js'
import * as lumi from '../src/index.js'

// @ts-expect-error unused convenience mounting is not public.
lumi.mount
// @ts-expect-error raw HTML has no dedicated public binding.
lumi.html
// @ts-expect-error keyed component repetition is not public.
lumi.repeat

/** @typedef {{ count: number }} CounterData */

const template = document.createElement('template')
template.innerHTML = '<output></output>'

/** @type {import('../src/index.js').ComponentOptions<CounterData>} */
const options = {
  template,
  bindings: [
    bind('output', data => data.count),
    prop('output', data => data.count, 'value'),
    attr('output', 'aria-label', data => data.count),
    event('output', 'click', (nativeEvent, output) => {
      const click = /** @type {MouseEvent} */ (nativeEvent)
      const control = /** @type {HTMLOutputElement} */ (output)
      void click
      void control
    }),
  ],
}

// @ts-expect-error bind projections must return text values or arrays.
bind('output', () => ({ count: 1 }))

bind('output', () => [{ count: 1 }])
bind('output', () => null)
bind('output', () => undefined)

// @ts-expect-error attribute projections must return text-compatible primitives.
attr('output', 'title', () => ['invalid'])
attr('output', 'title', () => null)

// @ts-expect-error class projections must return booleans.
classToggle('output', 'active', () => 'true')
classToggle('output', 'active', () => undefined)

// @ts-expect-error style projections must return strings.
style('output', 'color', () => 1)
style('output', 'color', () => null)

// Property bindings intentionally preserve arbitrary inferred value types.
prop('output', () => ({ mode: 'compact' }), 'lumiConfig')

const mounted = component(options).mount(document.body)
mounted.update({ count: 1 })

// @ts-expect-error count is required to be a number.
mounted.update({ count: '1' })
