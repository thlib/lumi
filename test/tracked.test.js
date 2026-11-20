// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {
  child,
  classToggle,
  component,
  flush,
  on,
  prop,
  repeat,
  text,
  tracked,
} from '../src/index.js'

/**
 * @template Data
 * @typedef {import('../src/index.js').ComponentOptions<Data>} Options
 */

/** @typedef {{id: number, name: string, done?: boolean}} Item */
/** @typedef {{title: string, items: Item[]}} List */

/**
 * @param {string} markup
 */
function createSource(markup) {
  const {window} = new JSDOM()
  const document = window.document
  const template = document.createElement('template')
  template.innerHTML = markup
  return {document, template, window}
}

/**
 * Mounts a title and a keyed list. `calls` records each projection call.
 *
 * @param {List} data
 */
function mountList(data) {
  const {document, template, window} = createSource(
    '<section><h1></h1><p class="count"></p>'
    + '<ul><li class="item"><span class="name"></span></li></ul></section>',
  )
  /** @type {string[]} */
  const calls = []
  /** @type {Options<List>} */
  const options = {
    source: template,
    bindings: [
      text('h1', ({data}) => {
        calls.push('title')
        return data.title
      }),
      text('.count', ({data}) => {
        calls.push('count')
        return data.items.length
      }),
      repeat(
        '.item',
        ({data}) => {
          calls.push('list')
          return data.items
        },
        ({item}) => /** @type {Item} */ (item).id,
        [
          text('.name', ({item}) => {
            const {id, name} = /** @type {Item} */ (item)
            calls.push(`name ${id}`)
            return name
          }),
          classToggle(':scope', 'done', ({item}) => {
            return /** @type {Item} */ (item).done === true
          }),
        ],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  const names = () => {
    return Array.from(
      mounted.root.querySelectorAll('.name'),
      element => element.textContent,
    )
  }
  const elements = () => Array.from(mounted.root.querySelectorAll('.item'))

  mounted.update(data)
  calls.length = 0
  return {mounted, names, elements, calls, document, window}
}

/**
 * @returns {List}
 */
function listData() {
  return tracked({
    title: 'Tasks',
    items: [
      {id: 1, name: 'one'},
      {id: 2, name: 'two'},
      {id: 3, name: 'three'},
    ],
  })
}

/**
 * jsdom does not implement Trusted Types. This installs a test factory and
 * returns a function that makes trusted markup.
 *
 * @param {import('jsdom').DOMWindow} window
 * @returns {(markup: string) => object}
 */
function installTestTrustedHTML(window) {
  const trustedValues = new WeakSet()

  class TestTrustedHTML {
    /** @param {string} value */
    constructor(value) {
      this.value = value
      trustedValues.add(this)
    }

    toString() {
      return this.value
    }
  }

  Reflect.set(window, 'trustedTypes', {
    /** @param {object} value */
    isHTML(value) {
      return trustedValues.has(value)
    },
  })

  return markup => new TestTrustedHTML(markup)
}

/**
 * @template Value
 * @param {Value | undefined | null} value
 * @returns {Value}
 */
function required(value) {
  assert.ok(value !== undefined && value !== null)
  return value
}

test('a write to one item prepares only the row of that item', () => {
  const data = listData()
  const {names, elements, calls} = mountList(data)
  const before = elements()

  required(data.items[1]).name = 'TWO'
  flush()

  assert.deepEqual(names(), ['one', 'TWO', 'three'])
  assert.deepEqual(calls, ['name 2'])
  assert.deepEqual(elements(), before)
})

test('writes are collected and applied in one microtask', async () => {
  const data = listData()
  const {names, calls} = mountList(data)

  required(data.items[0]).name = 'a'
  required(data.items[0]).name = 'b'
  required(data.items[2]).name = 'c'

  assert.deepEqual(names(), ['one', 'two', 'three'])

  await Promise.resolve()

  assert.deepEqual(names(), ['b', 'two', 'c'])
  assert.deepEqual(calls, ['name 1', 'name 3'])
})

test('a write of the same value prepares nothing', () => {
  const data = listData()
  const {calls} = mountList(data)

  required(data.items[1]).name = 'two'
  data.title = 'Tasks'
  flush()

  assert.deepEqual(calls, [])
})

test('a write outside the list prepares only the sinks that read it', () => {
  const data = listData()
  const {mounted, calls} = mountList(data)

  data.title = 'Work'
  flush()

  assert.equal(mounted.root.querySelector('h1')?.textContent, 'Work')
  // The sinks of the component scope are one part.
  assert.deepEqual(calls, ['title', 'count'])
})

test('an added item prepares the list and the new row only', () => {
  const data = listData()
  const {mounted, names, elements, calls} = mountList(data)
  const before = elements()

  data.items.push({id: 4, name: 'four'})
  flush()

  assert.deepEqual(names(), ['one', 'two', 'three', 'four'])
  assert.deepEqual(elements().slice(0, 3), before)
  assert.equal(mounted.root.querySelector('.count')?.textContent, '4')
  assert.deepEqual(calls, ['title', 'count', 'list', 'name 4'])
})

test('a removed item removes its row without other preparation', () => {
  const data = listData()
  const {names, elements, calls} = mountList(data)
  const [first, , third] = elements()

  data.items.splice(1, 1)
  flush()

  assert.deepEqual(names(), ['one', 'three'])
  assert.deepEqual(elements(), [first, third])
  assert.deepEqual(calls, ['title', 'count', 'list'])
})

test('a reorder moves the rows without preparation of the rows', () => {
  const data = listData()
  const {names, elements, calls} = mountList(data)
  const [first, second, third] = elements()

  data.items.reverse()
  flush()

  assert.deepEqual(names(), ['three', 'two', 'one'])
  assert.deepEqual(elements(), [third, second, first])
  assert.deepEqual(calls, ['list'])
})

test('a replaced item with the same key prepares its row', () => {
  const data = listData()
  const {names, elements, calls} = mountList(data)
  const before = elements()

  data.items[1] = {id: 2, name: 'second'}
  flush()

  assert.deepEqual(names(), ['one', 'second', 'three'])
  assert.deepEqual(elements(), before)
  assert.deepEqual(calls, ['list', 'name 2'])
})

test('a replaced list keeps the rows of the items that it still has', () => {
  const data = listData()
  const {names, elements, calls} = mountList(data)
  const [first, second] = elements()
  const kept = required(data.items[1])

  data.items = [kept, {id: 9, name: 'nine'}]
  flush()

  assert.deepEqual(names(), ['two', 'nine'])
  assert.equal(elements()[0], second)
  assert.notEqual(elements()[1], first)
  assert.deepEqual(calls, ['title', 'count', 'list', 'name 9'])
})

test('a changed row in a changed list is prepared one time', () => {
  const data = listData()
  const {names, calls} = mountList(data)

  required(data.items[0]).name = 'ONE'
  data.items.push({id: 4, name: 'four'})
  flush()

  assert.deepEqual(names(), ['ONE', 'two', 'three', 'four'])
  assert.deepEqual(
    calls.filter(call => call.startsWith('name')),
    ['name 1', 'name 4'],
  )
})

test('a row that reads its position is prepared when the position changes', () => {
  const {document, template} = createSource(
    '<ul><li class="item"><b></b><i></i></li></ul>',
  )
  /** @type {string[]} */
  const calls = []
  const data = tracked({items: [{id: 1}, {id: 2}, {id: 3}]})
  /** @type {Options<{items: Array<{id: number}>}>} */
  const options = {
    source: template,
    bindings: [
      repeat(
        '.item',
        ({data}) => data.items,
        ({item}) => /** @type {{id: number}} */ (item).id,
        [
          text('b', ({item, index}) => {
            const {id} = /** @type {{id: number}} */ (item)
            calls.push(`row ${id}`)
            return `${index + 1}. ${id}`
          }),
        ],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  const rows = () => {
    return Array.from(
      mounted.root.querySelectorAll('b'),
      element => element.textContent,
    )
  }

  mounted.update(data)
  calls.length = 0

  data.items.shift()
  flush()

  assert.deepEqual(rows(), ['1. 2', '2. 3'])
  assert.deepEqual(calls, ['row 2', 'row 3'])
})

test('a nested list prepares only the changed nested row', () => {
  const {document, template} = createSource(
    '<div><section class="group"><h2></h2>'
    + '<span class="member"></span></section></div>',
  )
  /** @type {string[]} */
  const calls = []
  /** @typedef {{name: string, members: Array<{name: string}>}} Group */
  const data = tracked({
    groups: [
      {name: 'a', members: [{name: 'a1'}, {name: 'a2'}]},
      {name: 'b', members: [{name: 'b1'}]},
    ],
  })
  /** @type {Options<{groups: Group[]}>} */
  const options = {
    source: template,
    bindings: [
      repeat('.group', ({data}) => data.groups, [
        text('h2', ({item}) => {
          const {name} = /** @type {Group} */ (item)
          calls.push(`group ${name}`)
          return name
        }),
        repeat(
          '.member',
          ({item}) => {
            return /** @type {Group} */ (/** @type {unknown} */ (item)).members
          },
          [
            text(':scope', ({item, parent}) => {
              const {name} = /** @type {{name: string}} */ (item)
              const group = /** @type {Group} */ (
                /** @type {unknown} */ (parent?.item)
              )
              calls.push(`member ${name}`)
              return `${group.name}/${name}`
            }),
          ],
        ),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)
  const members = () => {
    return Array.from(
      mounted.root.querySelectorAll('.member'),
      element => element.textContent,
    )
  }

  mounted.update(data)
  calls.length = 0

  required(required(data.groups[0]).members[1]).name = 'A2'
  flush()
  assert.deepEqual(members(), ['a/a1', 'a/A2', 'b/b1'])
  assert.deepEqual(calls, ['member A2'])

  calls.length = 0
  required(data.groups[1]).members.push({name: 'b2'})
  flush()
  assert.deepEqual(members(), ['a/a1', 'a/A2', 'b/b1', 'b/b2'])
  assert.deepEqual(calls, ['member b2'])

  // The nested rows read the name of their group.
  calls.length = 0
  required(data.groups[1]).name = 'B'
  flush()
  assert.deepEqual(members(), ['a/a1', 'a/A2', 'B/b1', 'B/b2'])
  assert.deepEqual(calls.sort(), ['group B', 'member b1', 'member b2'])

  calls.length = 0
  data.groups.shift()
  flush()
  assert.deepEqual(members(), ['B/b1', 'B/b2'])
  assert.deepEqual(calls, ['group B', 'member b1', 'member b2'])
})

test('a positional list keeps the rows of unchanged items', () => {
  const {document, template} = createSource(
    '<ul><li class="item"></li></ul>',
  )
  /** @type {string[]} */
  const calls = []
  const data = tracked({items: [{name: 'a'}, {name: 'b'}]})
  /** @type {Options<{items: Array<{name: string}>}>} */
  const options = {
    source: template,
    bindings: [
      repeat('.item', ({data}) => data.items, [
        text(':scope', ({item}) => {
          const {name} = /** @type {{name: string}} */ (item)
          calls.push(name)
          return name
        }),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)
  const rows = () => {
    return Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    )
  }

  mounted.update(data)
  calls.length = 0

  data.items.push({name: 'c'})
  flush()
  assert.deepEqual(rows(), ['a', 'b', 'c'])
  assert.deepEqual(calls, ['c'])

  calls.length = 0
  data.items.shift()
  flush()
  assert.deepEqual(rows(), ['b', 'c'])
  assert.deepEqual(calls, ['b', 'c'])
})

test('a list of primitive values updates', () => {
  const {document, template} = createSource(
    '<ul><li class="item"></li></ul>',
  )
  const data = tracked({tags: ['a', 'b']})
  /** @type {Options<{tags: string[]}>} */
  const options = {
    source: template,
    bindings: [
      repeat('.item', ({data}) => data.tags, [
        text(':scope', ({item}) => /** @type {string} */ (item)),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)
  const rows = () => {
    return Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    )
  }

  mounted.update(data)
  data.tags[1] = 'B'
  data.tags.push('c')
  flush()

  assert.deepEqual(rows(), ['a', 'B', 'c'])
})

test('a projection that makes a new list from tracked items updates', () => {
  const {document, template} = createSource(
    '<ul><li class="item"></li></ul>',
  )
  const data = tracked({
    items: [
      {name: 'a', visible: true},
      {name: 'b', visible: false},
      {name: 'c', visible: true},
    ],
  })
  /** @typedef {{name: string, visible: boolean}} Row */
  /** @type {Options<{items: Row[]}>} */
  const options = {
    source: template,
    bindings: [
      repeat(
        '.item',
        ({data}) => data.items.filter(item => item.visible),
        [text(':scope', ({item}) => /** @type {Row} */ (item).name)],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  const rows = () => {
    return Array.from(
      mounted.root.querySelectorAll('.item'),
      element => element.textContent,
    )
  }

  mounted.update(data)
  assert.deepEqual(rows(), ['a', 'c'])

  required(data.items[1]).visible = true
  required(data.items[2]).name = 'C'
  flush()
  assert.deepEqual(rows(), ['a', 'b', 'C'])

  data.items.length = 1
  flush()
  assert.deepEqual(rows(), ['a'])
})

test('a component without a repeat binding updates', () => {
  const {document, template} = createSource(
    '<p><span class="a"></span><span class="b"></span></p>',
  )
  const data = tracked({a: 1, b: {value: 2}})
  /** @type {Options<{a: number, b: {value: number}}>} */
  const options = {
    source: template,
    bindings: [
      text('.a', ({data}) => data.a),
      text('.b', ({data}) => data.b.value),
    ],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)
  data.b.value = 3
  flush()
  assert.equal(mounted.root.textContent, '13')

  data.b = {value: 4}
  data.a = 5
  flush()
  assert.equal(mounted.root.textContent, '54')
})

test('a projection depends only on the data of its last call', () => {
  const {document, template} = createSource('<p></p>')
  let calls = 0
  const data = tracked({useFirst: true, first: 'a', second: 'b'})
  /** @type {Options<{useFirst: boolean, first: string, second: string}>} */
  const options = {
    source: template,
    bindings: [
      text(':scope', ({data}) => {
        calls += 1
        return data.useFirst ? data.first : data.second
      }),
    ],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)
  calls = 0

  data.second = 'B'
  flush()
  assert.equal(calls, 0)

  data.useFirst = false
  flush()
  assert.equal(mounted.root.textContent, 'B')
  assert.equal(calls, 1)

  data.first = 'A'
  flush()
  assert.equal(calls, 1)

  data.second = 'c'
  flush()
  assert.equal(mounted.root.textContent, 'c')
})

test('a child component updates without its parent', () => {
  const {document, template} = createSource(
    '<main><h1></h1><div class="slot"></div></main>',
  )
  const childTemplate = document.createElement('template')
  childTemplate.innerHTML = '<p></p>'
  /** @type {string[]} */
  const calls = []
  /** @typedef {{title: string, user: {name: string}}} Page */
  const data = tracked({title: 't', user: {name: 'ann'}})
  /** @type {Options<{name: string}>} */
  const childOptions = {
    source: childTemplate,
    bindings: [
      text(':scope', ({data}) => {
        calls.push('child')
        return data.name
      }),
    ],
  }
  /** @type {Options<Page>} */
  const options = {
    source: template,
    bindings: [
      text('h1', ({data}) => {
        calls.push('title')
        return data.title
      }),
      child('.slot', component(childOptions), data => {
        calls.push('project')
        return data.user
      }),
    ],
  }
  const mounted = component(options).mount(document.body)
  const childText = () => mounted.root.querySelector('p')?.textContent

  mounted.update(data)
  calls.length = 0

  data.user.name = 'bob'
  flush()
  assert.equal(childText(), 'bob')
  assert.deepEqual(calls, ['child'])

  calls.length = 0
  data.user = {name: 'cat'}
  flush()
  assert.equal(childText(), 'cat')
  assert.deepEqual(calls, ['project', 'child'])

  calls.length = 0
  data.title = 'T'
  flush()
  assert.equal(mounted.root.querySelector('h1')?.textContent, 'T')
  assert.deepEqual(calls, ['title'])
})

test('a component with an innerHTML binding and a repeat binding updates', () => {
  const {document, template, window} = createSource(
    '<div><p class="html"></p><ul><li class="item"></li></ul></div>',
  )
  const html = installTestTrustedHTML(window)
  /** @typedef {{html: object, items: Array<{name: string}>}} Page */
  const data = tracked({html: html('<b>x</b>'), items: [{name: 'a'}]})
  /** @type {Options<Page>} */
  const options = {
    source: template,
    bindings: [
      prop('.html', ({data}) => data.html, 'innerHTML'),
      repeat('.item', ({data}) => data.items, [
        text(':scope', ({item}) => /** @type {{name: string}} */ (item).name),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)
  required(data.items[0]).name = 'A'
  data.items.push({name: 'b'})
  data.html = html('<i>y</i>')
  flush()

  assert.equal(mounted.root.querySelector('.html')?.innerHTML, '<i>y</i>')
  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.item'), li => li.textContent),
    ['A', 'b'],
  )
})

test('an element listener is attached to a row from a tracked write', () => {
  const {document, template, window} = createSource(
    '<ul><li class="item"><button type="button"></button></li></ul>',
  )
  /** @type {string[]} */
  const clicked = []
  const data = tracked({items: [{name: 'a'}]})
  /** @type {Options<{items: Array<{name: string}>}>} */
  const options = {
    source: template,
    bindings: [
      repeat('.item', ({data}) => data.items, [
        text('button', ({item}) => {
          return /** @type {{name: string}} */ (item).name
        }),
      ]),
      on('button', 'click', (event, button) => {
        clicked.push(button.textContent ?? '')
      }, {at: 'elements'}),
    ],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)
  data.items.push({name: 'b'})
  flush()

  for (const button of mounted.root.querySelectorAll('button')) {
    button.dispatchEvent(new window.Event('click'))
  }

  assert.deepEqual(clicked, ['a', 'b'])
})

test('an element receives the plain object, not the tracked view', () => {
  const {document, template} = createSource('<p></p>')
  const plain = {config: {depth: 1}}
  const data = tracked(plain)
  /** @type {Options<{config: {depth: number}}>} */
  const options = {
    source: template,
    bindings: [prop(':scope', ({data}) => data.config, 'config')],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)

  assert.equal(Reflect.get(mounted.root, 'config'), plain.config)
  assert.notEqual(data.config, plain.config)
})

test('a tracked item and its plain object are the same key', () => {
  const {document, template} = createSource(
    '<ul><li class="item"></li></ul>',
  )
  const plain = {items: [{name: 'a'}, {name: 'b'}]}
  const data = tracked(plain)
  /** @type {Options<{items: Array<{name: string}>}>} */
  const options = {
    source: template,
    bindings: [
      repeat(
        '.item',
        ({data}) => data.items,
        ({item}) => item,
        [text(':scope', ({item}) => /** @type {{name: string}} */ (item).name)],
      ),
    ],
  }
  const mounted = component(options).mount(document.body)
  const elements = () => Array.from(mounted.root.querySelectorAll('.item'))

  mounted.update(data)
  const [first, second] = elements()

  // A complete update with the plain data keeps the elements.
  plain.items.reverse()
  mounted.update(plain)

  assert.deepEqual(elements(), [second, first])
})

test('a write that does not go through the view is not seen', () => {
  const plain = {
    title: 'Tasks',
    items: [{id: 1, name: 'one'}],
  }
  const data = tracked(plain)
  const {mounted, names} = mountList(data)

  required(plain.items[0]).name = 'ONE'
  flush()
  assert.deepEqual(names(), ['one'])

  // A complete update reads all data again.
  mounted.update(data)
  assert.deepEqual(names(), ['ONE'])
})

test('a complete update with plain data stops the tracking', () => {
  const data = listData()
  const {mounted, names, calls} = mountList(data)

  mounted.update({title: 'Plain', items: [{id: 1, name: 'plain'}]})
  calls.length = 0

  required(data.items[0]).name = 'tracked'
  flush()

  assert.deepEqual(names(), ['plain'])
  assert.deepEqual(calls, [])
})

test('plain data that changes in place still renders on update', () => {
  const data = {title: 'Tasks', items: [{id: 1, name: 'one'}]}
  const {mounted, names} = mountList(data)

  required(data.items[0]).name = 'ONE'
  mounted.update(data)

  assert.deepEqual(names(), ['ONE'])
})

test('a projection must not change tracked data', () => {
  const {document, template} = createSource('<p></p>')
  const data = tracked({count: 0})
  /** @type {Options<{count: number}>} */
  const options = {
    source: template,
    bindings: [
      text(':scope', ({data}) => {
        data.count += 1
        return data.count
      }),
    ],
  }
  const mounted = component(options).mount(document.body)

  assert.throws(() => mounted.update(data), /must not change tracked data/)
  assert.equal(data.count, 0)
})

test('a failed preparation changes no DOM and a later write recovers', () => {
  const data = listData()
  const {names} = mountList(data)

  required(data.items[0]).name = 'ONE'
  required(data.items[1]).id = 3
  assert.throws(() => flush(), /duplicated at item positions 2 and 3/)
  assert.deepEqual(names(), ['one', 'two', 'three'])

  required(data.items[1]).id = 2
  flush()
  assert.deepEqual(names(), ['ONE', 'two', 'three'])
})

test('a projection error in one row keeps the row changed', () => {
  const {document, template} = createSource(
    '<ul><li class="item"></li></ul>',
  )
  const data = tracked({items: [{name: 'a', fail: false}]})
  /** @typedef {{name: string, fail: boolean}} Row */
  /** @type {Options<{items: Row[]}>} */
  const options = {
    source: template,
    bindings: [
      repeat('.item', ({data}) => data.items, [
        text(':scope', ({item}) => {
          const row = /** @type {Row} */ (item)

          if (row.fail) {
            throw new Error('no')
          }
          return row.name
        }),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)
  const row = required(data.items[0])

  row.fail = true
  row.name = 'b'
  assert.throws(() => flush(), /failed: no/)
  assert.equal(mounted.root.textContent, 'a')

  row.fail = false
  flush()
  assert.equal(mounted.root.textContent, 'b')
})

test('an unmounted component ignores tracked writes', () => {
  const data = listData()
  const {mounted, calls} = mountList(data)

  mounted.unmount()
  data.title = 'x'
  required(data.items[0]).name = 'x'
  data.items.push({id: 4, name: 'four'})
  flush()

  assert.deepEqual(calls, [])
})

test('two components render the same tracked data', () => {
  const data = listData()
  const first = mountList(data)
  const second = mountList(data)

  required(data.items[2]).name = 'THREE'
  flush()

  assert.deepEqual(first.names(), ['one', 'two', 'THREE'])
  assert.deepEqual(second.names(), ['one', 'two', 'THREE'])
})

test('tracked returns one view for one plain object', () => {
  const plain = {user: {name: 'ann'}, list: [{n: 1}]}
  const data = tracked(plain)

  assert.equal(tracked(plain), data)
  assert.equal(tracked(data), data)
  assert.equal(data.user, data.user)
  assert.equal(data.list[0], tracked(required(plain.list[0])))
  assert.ok(Array.isArray(data.list))
  assert.deepEqual(JSON.parse(JSON.stringify(data)), plain)
})

test('a write through the view changes the plain object', () => {
  const plain = /** @type {{user: {name: string}, extra?: object}} */ (
    {user: {name: 'ann'}}
  )
  const data = tracked(plain)
  const extra = tracked({a: 1})

  data.user.name = 'bob'
  data.extra = extra

  assert.equal(plain.user.name, 'bob')
  // The plain object holds the plain value, not the view.
  assert.notEqual(plain.extra, extra)
  assert.equal(data.extra, extra)

  delete data.extra
  assert.equal('extra' in plain, false)
})

test('tracked accepts only plain objects and arrays', () => {
  for (const value of [null, 1, 'a', new Date(), new Map(), () => {}]) {
    assert.throws(
      () => tracked(/** @type {object} */ (/** @type {unknown} */ (value))),
      /must be a plain object or an array/,
    )
  }

  const date = new Date()
  const data = tracked({date, frozen: Object.freeze({inner: {a: 1}})})

  // Lumi does not wrap an object that is not plain data.
  assert.equal(data.date, date)
  assert.equal(data.frozen.inner.a, 1)
})

test('a projection that reads the keys of an object updates', () => {
  const {document, template} = createSource('<p></p>')
  /** @type {Record<string, number>} */
  const plain = {a: 1}
  const data = tracked(plain)
  /** @type {Options<Record<string, number>>} */
  const options = {
    source: template,
    bindings: [text(':scope', ({data}) => Object.keys(data).join(','))],
  }
  const mounted = component(options).mount(document.body)

  mounted.update(data)
  data.b = 2
  flush()
  assert.equal(mounted.root.textContent, 'a,b')

  delete data.a
  flush()
  assert.equal(mounted.root.textContent, 'b')
})

test('a complete update applies the writes that are not yet applied', () => {
  const data = listData()
  const {mounted, names, calls} = mountList(data)

  required(data.items[0]).name = 'ONE'
  mounted.update(data)
  assert.deepEqual(names(), ['ONE', 'two', 'three'])

  calls.length = 0
  flush()
  assert.deepEqual(calls, [])
})

/**
 * A small deterministic random number generator.
 *
 * @param {number} seed
 * @returns {(limit: number) => number}
 */
function randomIntegers(seed) {
  let state = seed

  return limit => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % limit
  }
}

/** @typedef {{id: number, name: string, tags: string[]}} Row */

/**
 * Mounts groups of rows. Each row shows its position and a nested list.
 *
 * @param {boolean} keyed
 */
function mountRows(keyed) {
  const {document, template} = createSource(
    '<div><p class="total"></p><ul><li class="row"><b></b>'
    + '<i class="tag"></i></li></ul></div>',
  )
  const rowBindings = [
    text('b', (/** @type {{item: unknown, index: number}} */ {item, index}) => {
      const row = /** @type {Row} */ (item)
      return row.id % 3 === 0 ? `${index}:${row.name}` : row.name
    }),
    repeat(
      '.tag',
      (/** @type {{item: unknown}} */ {item}) => /** @type {Row} */ (item).tags,
      [text(':scope', (/** @type {{item: unknown}} */ {item}) => {
        return /** @type {string} */ (item)
      })],
    ),
  ]
  /** @typedef {{data: {rows: Row[]}}} RowsContext */
  const keyedRows = repeat(
    '.row',
    (/** @type {RowsContext} */ {data}) => data.rows,
    ({item}) => /** @type {Row} */ (item).id,
    rowBindings,
  )
  const positionalRows = repeat(
    '.row',
    (/** @type {RowsContext} */ {data}) => data.rows,
    rowBindings,
  )
  /** @type {Options<{rows: Row[]}>} */
  const options = {
    source: template,
    bindings: [
      text('.total', ({data}) => data.rows.length),
      keyed ? keyedRows : positionalRows,
    ],
  }
  const mounted = component(options).mount(document.body)

  return {mounted, html: () => mounted.root.innerHTML}
}

for (const keyed of [true, false]) {
  test(`random tracked writes give the DOM of a complete update (${keyed ? 'keyed' : 'positional'})`, () => {
    const random = randomIntegers(keyed ? 7 : 11)
    let nextId = 0
    /** @returns {Row} */
    const makeRow = () => {
      nextId += 1
      return {
        id: nextId,
        name: `row ${nextId}`,
        tags: Array.from({length: random(3)}, (_, index) => `t${index}`),
      }
    }
    /** @type {{rows: Row[]}} */
    const plain = {rows: Array.from({length: 5}, makeRow)}
    const data = tracked(plain)
    const live = mountRows(keyed)
    const reference = mountRows(keyed)

    live.mounted.update(data)

    for (let step = 0; step < 400; step += 1) {
      const rows = data.rows
      const writes = 1 + random(3)

      for (let write = 0; write < writes; write += 1) {
        const position = rows.length === 0 ? 0 : random(rows.length)
        const row = rows[position]

        switch (random(12)) {
          case 0:
            rows.push(makeRow())
            break
          case 1:
            rows.unshift(makeRow())
            break
          case 2:
            rows.splice(position, 1)
            break
          case 3:
            rows.splice(position, 0, makeRow())
            break
          case 4:
            rows.reverse()
            break
          case 5:
            if (row !== undefined) {
              row.name += '!'
            }
            break
          case 6:
            if (row !== undefined) {
              row.tags.push(`t${row.tags.length}`)
            }
            break
          case 7:
            if (row !== undefined) {
              row.tags = row.tags.slice(1)
            }
            break
          case 8:
            if (row !== undefined && rows.length > 1) {
              const other = random(rows.length)
              const moved = /** @type {Row} */ (rows[other])
              rows[other] = row
              rows[position] = moved
            }
            break
          case 9:
            if (row !== undefined) {
              rows[position] = {...row, name: `${row.name}?`, tags: [...row.tags]}
            }
            break
          case 10:
            data.rows = rows.filter((_, index) => index % 4 !== random(4))
            break
          default:
            if (row !== undefined) {
              const tag = row.tags[0]

              if (tag !== undefined) {
                row.tags[0] = `${tag}*`
              }
            }
        }
      }

      flush()
      // The reference component renders the plain data completely.
      reference.mounted.update(plain)
      assert.equal(live.html(), reference.html(), `step ${step}`)
    }
  })
}
