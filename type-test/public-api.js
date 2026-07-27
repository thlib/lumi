// @ts-check

import {
  attr,
  classToggle,
  component,
  on,
  prop,
  repeat,
  style,
  text,
} from '../src/index.js'
import * as lumi from '../src/index.js'

// @ts-expect-error unused convenience mounting is not public.
lumi.mount
// @ts-expect-error raw HTML has no dedicated public binding.
lumi.html

/** @typedef {import('../src/index.js').ProjectionContext<CounterData, CounterData>} CounterContext */

/** @typedef {{ count: number }} CounterData */

const template = document.createElement('template')
template.innerHTML = '<output></output>'

/** @type {import('../src/index.js').ComponentOptions<CounterData>} */
const options = {
  template,
  bindings: [
    text('output', (/** @type {CounterContext} */ {data}) => data.count),
    prop('output', (/** @type {CounterContext} */ {data}) => data.count, 'value'),
    attr('output', 'aria-label', (/** @type {CounterContext} */ {data}) => data.count),
    on('output', 'click', (nativeEvent, output) => {
      const click = /** @type {MouseEvent} */ (nativeEvent)
      const control = /** @type {HTMLOutputElement} */ (output)
      void click
      void control
    }),
    on('video', 'ended', () => {}, {
      at: 'elements',
      capture: true,
      passive: true,
      freq: 'once',
    }),
  ],
}

repeat('li', (/** @type {CounterContext} */ {data}, el) => {
  const item = /** @type {HTMLLIElement} */ (el)
  void item
  return Array.from({length: data.count}, (_, index) => index)
}, [
  text('li', (/** @type {CounterContext} */ {item}) => item.count),
])

text('output', (/** @type {CounterContext} */ {item}, el) => {
  const output = /** @type {HTMLOutputElement} */ (el)
  void output
  return item.count
})

// @ts-expect-error text projections do not accept arrays.
text('output', () => ['invalid'])

// @ts-expect-error the native once option is replaced by freq.
on('output', 'click', () => {}, { once: true })

// @ts-expect-error freq accepts only the declared frequencies.
on('output', 'click', () => {}, { freq: 'sometimes' })

// @ts-expect-error unsupported event options are rejected.
on('output', 'click', () => {}, { prevent: true })

// @ts-expect-error at accepts only the declared binding locations.
on('output', 'click', () => {}, { at: 'document' })

// @ts-expect-error text projections must return a text-compatible scalar.
text('output', () => ({ count: 1 }))
// @ts-expect-error text projections do not accept arrays.
text('output', () => [{ count: 1 }])
text('output', () => null)
text('output', () => undefined)

// @ts-expect-error attribute projections must return text-compatible primitives.
attr('output', 'title', () => ({ invalid: true }))
attr('output', 'title', () => null)

// @ts-expect-error class projections must return booleans.
classToggle('output', 'active', () => 'true')
classToggle('output', 'active', () => undefined)

// @ts-expect-error style projections must return strings.
style('output', 'color', () => 1)
style('output', 'color', () => null)

// @ts-expect-error arrays belong to repeat, not scalar projections.
attr('output', 'title', () => ['first', 'second'])
// @ts-expect-error arrays belong to repeat, not scalar projections.
classToggle('output', 'active', () => [true, false])
// @ts-expect-error arrays belong to repeat, not scalar projections.
style('output', 'color', () => ['red', 'blue'])

// Property bindings intentionally preserve arbitrary inferred value types.
prop('output', () => ({ mode: 'compact' }), 'lumiConfig')

const mounted = component(options).mount(document.body)
mounted.update({ count: 1 })

// @ts-expect-error count is required to be a number.
mounted.update({ count: '1' })
