// @ts-check

import {
  component,
  on,
  property,
  text,
} from '../src/index.js'

/** @typedef {{ count: number, maximum: number }} CounterData */

const template = document.querySelector('#counter-template')
const target = document.querySelector('#counter-slot')

if (!(template instanceof HTMLTemplateElement) || target === null) {
  throw new Error('Counter example markup is incomplete')
}

/** @type {import('../src/index.js').ComponentOptions<CounterData>} */
const counterOptions = {
  template,
  bindings: [
    text('.counter-value', data => data.count),
    property(
      '.counter-increment',
      'disabled',
      data => data.count >= data.maximum,
    ),
  ],
  events: [
    on('.counter-increment', 'click', ({ root }) => {
      root.dispatchEvent(new CustomEvent('counter:increment-requested', {
        bubbles: true,
      }))
    }),
  ],
}

const counter = component(counterOptions).mount(target)
/** @type {CounterData} */
let data = { count: 0, maximum: 5 }

target.addEventListener('counter:increment-requested', () => {
  data = { ...data, count: data.count + 1 }
  counter.render(data)
})

counter.render(data)
