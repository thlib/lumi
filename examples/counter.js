import {
  mount,
  property,
  text,
} from '../src/index.js'
import { on } from './plain.js'

let data = { count: 0, maximum: 5 }
const slot = document.querySelector('#counter-slot')

const counter = mount(data, {
  target: slot,
  template: document.querySelector('template'),
  bindings: [
    text('[data-counter-value]', data => `count is ${data.count}`),
    property(
      '[data-counter-increment]',
      'disabled',
      data => data.count >= data.maximum,
    ),
  ],
})

on(slot, 'click', '[data-counter-increment]', () => {
  data = { ...data, count: data.count + 1 }
  counter.render(data)
})
