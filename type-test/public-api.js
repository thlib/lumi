// @ts-check

import {
  component,
  mount,
  on,
  property,
  repeat,
  text,
} from '../src/index.js'

/** @typedef {{ count: number }} CounterData */

const template = document.createElement('template')
template.innerHTML = '<output></output>'

/** @type {import('../src/index.js').ComponentOptions<CounterData>} */
const options = {
  template,
  bindings: [
    text('output', data => data.count),
    property('output', 'value', data => data.count),
  ],
}

const mounted = component(options).mount(document.body)
mounted.render({ count: 1 })

// @ts-expect-error count is required to be a number.
mounted.render({ count: '1' })

const inferred = mount({ count: 1 }, {
  target: document.querySelector('#target'),
  template: document.querySelector('template'),
  bindings: [
    text('output', data => data.count),
  ],
  events: [
    on('output', 'click', ({ data, render }) => {
      render({ count: data.count + 1 })

      // @ts-expect-error inferred count remains a number.
      render({ count: '1' })
    }),
  ],
})

inferred.render({ count: 2 })

// @ts-expect-error initial data determines the mounted data contract.
inferred.render({ count: '2' })

/** @typedef {{ id: string }} Item */
const itemTemplate = document.createElement('template')
itemTemplate.innerHTML = '<li></li>'
/** @type {import('../src/index.js').ComponentOptions<Item>} */
const itemOptions = { template: itemTemplate }

/** @type {import('../src/index.js').ComponentOptions<{ items: Item[] }>} */
const listOptions = {
  template,
  bindings: [
    repeat('output', {
      items: data => data.items,
      key: item => item.id,
      component: component(itemOptions),
    }),
  ],
}

component(listOptions)

repeat('output', {
  items: (data) => data.items,
  // @ts-expect-error repeat keys must be strings or numbers.
  key: (item) => ({ id: item.id }),
  component: component(itemOptions),
})
