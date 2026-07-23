import {
  mount,
  on,
  property,
  text,
} from '../src/index.js'

mount({ count: 0, maximum: 5 }, {
  target: document.querySelector('#counter-slot'),
  template: document.querySelector('template'),
  bindings: [
    text('.counter-value', data => data.count),
    property(
      '.counter-increment',
      'disabled',
      data => data.count >= data.maximum,
    ),
  ],
  events: [
    on('.counter-increment', 'click', ({ data, render }) => {
      render({ ...data, count: data.count + 1 })
    }),
  ],
})
