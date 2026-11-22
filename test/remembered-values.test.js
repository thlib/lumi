// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {
  attr,
  classToggle,
  component,
  prop,
  repeat,
  style,
  text,
} from '../src/index.js'
import {installMoveBefore} from '../src/shims/move-before.js'

/**
 * @template Data
 * @typedef {import('../src/types.js').Binding<Data>} Binding
 */

/**
 * Makes a projection from a function of the data. The tests give data of
 * many shapes, so the data has no declared type.
 *
 * @param {(data: any) => any} project
 * @returns {(context: {data: unknown}) => any}
 */
function from(project) {
  return ({data}) => project(data)
}

/**
 * Makes a projection from a function of the item.
 *
 * @param {(item: any) => any} project
 * @returns {(context: {item: unknown}) => any}
 */
function fromItem(project) {
  return ({item}) => project(item)
}

/**
 * @returns {{document: Document, window: import('jsdom').DOMWindow}}
 */
function createDocument() {
  const {window} = new JSDOM()
  installMoveBefore(window)
  return {document: window.document, window}
}

/**
 * @param {Document} document
 * @param {string} markup
 * @returns {HTMLTemplateElement}
 */
function createTemplate(document, markup) {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template
}

/**
 * @template Value
 * @param {Value | null | undefined} value
 * @returns {Value}
 */
function required(value) {
  assert.ok(value)
  return value
}

/**
 * Mounts one `.v` element with the given bindings.
 *
 * @template Data
 * @param {ReadonlyArray<Binding<Data>>} bindings
 * @param {string} [attributes]
 */
function mountTarget(bindings, attributes = '') {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      `<section><p class="v" ${attributes}>Default</p></section>`,
    ),
    bindings,
  }).mount(document.body)
  const target = /** @type {HTMLElement} */ (
    required(mounted.root.querySelector('.v'))
  )

  return {mounted, target}
}

/**
 * The bindings that remember the value that they wrote: the binding, a
 * write by other code, and a read of the state.
 *
 * @type {ReadonlyArray<{
 *   name: string,
 *   bind: (project: (data: any) => any) => Binding<any>,
 *   values: [unknown, unknown],
 *   write: (target: HTMLElement) => void,
 *   read: (target: HTMLElement) => unknown
 * }>}
 */
const writers = [
  {
    name: 'text',
    bind: project => text('.v', from(project)),
    values: ['one', 'two'],
    write: target => { target.textContent = 'foreign' },
    read: target => target.textContent,
  },
  {
    name: 'attr',
    bind: project => attr('.v', 'title', from(project)),
    values: ['one', 'two'],
    write: target => { target.setAttribute('title', 'foreign') },
    read: target => target.getAttribute('title'),
  },
  {
    name: 'classToggle',
    bind: project => classToggle('.v', 'on', from(project)),
    values: [true, false],
    write: target => { target.classList.toggle('on') },
    read: target => target.classList.contains('on'),
  },
  {
    name: 'style',
    bind: project => style('.v', 'color', from(project)),
    values: ['red', 'blue'],
    write: target => { target.style.color = 'green' },
    read: target => target.style.color,
  },
]

for (const {name, bind, values: [first, second], write, read} of writers) {
  test(`a foreign ${name} write stays until the projection changes`, () => {
    const {mounted, target} = mountTarget([bind(data => data.value)])

    mounted.update({value: first})
    assert.equal(read(target), first)

    write(target)
    const foreign = read(target)

    assert.notEqual(foreign, first)
    mounted.update({value: first})
    assert.equal(read(target), foreign)

    mounted.update({value: second})
    assert.equal(read(target), second)

    mounted.update({value: first})
    assert.equal(read(target), first)
  })

  test(`a ${name} binding compares with the DOM after a nullish result`, () => {
    const {mounted, target} = mountTarget([bind(data => data.value)])

    mounted.update({value: first})
    mounted.update({value: null})
    assert.equal(read(target), first)

    // The nullish result kept the DOM state, so the binding has no record
    // of that state. Its next value is compared with the DOM.
    mounted.update({value: second})
    assert.equal(read(target), second)
  })

  test(`the last of two ${name} declarations for one state wins`, () => {
    const {mounted, target} = mountTarget([
      bind(data => data.first),
      bind(data => data.second),
    ])

    mounted.update({first, second})
    assert.equal(read(target), second)

    // Only the first declaration changes. The second declaration writes
    // its value again.
    mounted.update({first: second, second: first})
    mounted.update({first, second: first})
    mounted.update({first: second, second: first})
    assert.equal(read(target), first)
  })
}

test('a property binding compares with the live property', () => {
  const {mounted, target} = mountTarget([
    prop('.v', ({data}) => /** @type {{title: string}} */ (data).title, 'title'),
  ])

  mounted.update({title: 'one'})
  target.title = 'foreign'
  mounted.update({title: 'one'})
  assert.equal(target.title, 'one')
})

test('a binding does not remember a state that another binding writes', () => {
  /**
   * Each case has two declarations for one element that write the same
   * state. The second declaration must write again after the first.
   *
   * @type {ReadonlyArray<{
   *   name: string,
   *   bindings: ReadonlyArray<Binding<any>>,
   *   read: (target: HTMLElement) => unknown,
   *   expected: [unknown, unknown]
   * }>}
   */
  const cases = [
    {
      name: 'the class attribute, then a class',
      bindings: [
        attr('.v', 'class', from(data => `v ${data.first}`)),
        classToggle('.v', 'on', () => true),
      ],
      read: target => target.className,
      expected: ['v a on', 'v b on'],
    },
    {
      name: 'a class, then the class attribute',
      bindings: [
        classToggle('.v', 'on', from(data => data.first === 'a')),
        attr('.v', 'class', () => 'v fixed'),
      ],
      read: target => target.className,
      expected: ['v fixed', 'v fixed'],
    },
    {
      name: 'the style attribute, then a style property',
      bindings: [
        attr('.v', 'style', from(data => {
          return `margin: ${data.first === 'a' ? 1 : 2}px`
        })),
        style('.v', 'color', () => 'red'),
      ],
      read: target => target.style.color,
      expected: ['red', 'red'],
    },
    {
      name: 'a shorthand style property, then its longhand',
      bindings: [
        style('.v', 'margin', from(data => data.first === 'a' ? '1px' : '2px')),
        style('.v', 'margin-left', () => '9px'),
      ],
      read: target => target.style.marginLeft,
      expected: ['9px', '9px'],
    },
    {
      name: 'a property, then the attribute that it reflects',
      bindings: [
        prop('.v', from(data => data.first), 'title'),
        attr('.v', 'title', () => 'fixed'),
      ],
      read: target => target.getAttribute('title'),
      expected: ['fixed', 'fixed'],
    },
    {
      name: 'an attribute, then the same attribute in other letter case',
      bindings: [
        attr('.v', 'TITLE', from(data => data.first)),
        attr('.v', 'title', () => 'fixed'),
      ],
      read: target => target.getAttribute('title'),
      expected: ['fixed', 'fixed'],
    },
    {
      name: 'a content property, then text',
      bindings: [
        prop('.v', from(data => data.first), 'textContent'),
        text('.v', () => 'fixed'),
      ],
      read: target => target.textContent,
      expected: ['fixed', 'fixed'],
    },
  ]

  for (const {name, bindings, read, expected} of cases) {
    const {mounted, target} = mountTarget(bindings)

    mounted.update({first: 'a'})
    assert.equal(read(target), expected[0], name)
    mounted.update({first: 'b'})
    assert.equal(read(target), expected[1], name)
    mounted.update({first: 'a'})
    assert.equal(read(target), expected[0], name)
  }
})

test('different states of one element keep their records', () => {
  const {mounted, target} = mountTarget([
    text('.v', from(data => data.text)),
    attr('.v', 'title', from(data => data.title)),
    classToggle('.v', 'on', from(data => data.on)),
    classToggle('.v', 'off', from(data => !data.on)),
  ])
  const writes = countAttributeWrites(target)

  mounted.update({text: 'a', title: 't', on: true})
  assert.equal(target.outerHTML, '<p class="v on" title="t">a</p>')
  assert.equal(writes.count, 2)

  mounted.update({text: 'a', title: 't', on: true})
  assert.equal(writes.count, 2)

  mounted.update({text: 'b', title: 't', on: false})
  assert.equal(target.outerHTML, '<p class="v off" title="t">b</p>')
  assert.equal(writes.count, 4)
})

/**
 * Counts the `setAttribute` and `removeAttribute` calls on one element.
 *
 * @param {Element} target
 */
function countAttributeWrites(target) {
  const writes = {count: 0}

  for (const method of /** @type {const} */ (['setAttribute', 'removeAttribute'])) {
    const original = target[method]

    Object.defineProperty(target, method, {
      configurable: true,
      value(/** @type {[string, string]} */ ...args) {
        writes.count += 1
        return Reflect.apply(original, this, args)
      },
    })
  }

  return writes
}

/** @typedef {{id: number, name: unknown, tone?: unknown, on?: unknown}} Row */

/**
 * Mounts a keyed list. Each row has a text, an attribute, and a class.
 *
 * @param {string} [row] The source markup of the row.
 */
function mountRows(
  row = '<li class="row"><b class="name">Default</b><i class="tone" data-tone="none"></i></li>',
) {
  const {document, window} = createDocument()
  /** @type {import('../src/index.js').ComponentOptions<Row[]>} */
  const options = {
    source: createTemplate(document, `<ul>${row}</ul>`),
    bindings: [
      repeat('.row', ({data}) => data, ({item}) => item.id, [
        text('.name', ({item}) => /** @type {string} */ (item.name)),
        attr('.tone', 'data-tone', ({item}) => {
          return /** @type {string} */ (item.tone)
        }),
        classToggle(':scope', 'on', ({item}) => {
          return /** @type {boolean} */ (item.on)
        }),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)
  const rows = () => Array.from(mounted.root.querySelectorAll('.row'))

  return {mounted, rows, document, window}
}

test('a new occurrence has its values and no state of another occurrence', () => {
  const {mounted, rows} = mountRows()

  mounted.update([
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 2, name: '', tone: false, on: false},
    {id: 3, name: 'Grace', tone: 'c', on: true},
    {id: 4, name: 4, tone: '', on: false},
  ])

  assert.deepEqual(rows().map(row => row.outerHTML), [
    '<li class="row on"><b class="name">Ada</b><i class="tone" data-tone="a"></i></li>',
    '<li class="row"><b class="name"></b><i class="tone"></i></li>',
    '<li class="row on"><b class="name">Grace</b><i class="tone" data-tone="c"></i></li>',
    '<li class="row"><b class="name">4</b><i class="tone" data-tone=""></i></li>',
  ])
})

test('a nullish projection keeps the source content of a new occurrence', () => {
  const {mounted, rows} = mountRows()

  mounted.update([
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 2, name: null, tone: undefined, on: null},
    {id: 3, name: 'Grace', tone: null, on: true},
    {id: 4, name: undefined, tone: 'd', on: false},
  ])

  assert.deepEqual(rows().map(row => row.outerHTML), [
    '<li class="row on"><b class="name">Ada</b><i class="tone" data-tone="a"></i></li>',
    '<li class="row"><b class="name">Default</b><i class="tone" data-tone="none"></i></li>',
    '<li class="row on"><b class="name">Grace</b><i class="tone" data-tone="none"></i></li>',
    '<li class="row"><b class="name">Default</b><i class="tone" data-tone="d"></i></li>',
  ])
})

test('a new occurrence changes when its values change', () => {
  const {mounted, rows} = mountRows()
  /** @type {Row[]} */
  const data = [
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 2, name: 'Grace', tone: 'b', on: false},
    {id: 3, name: 'Mary', tone: 'c', on: false},
  ]

  mounted.update(data)

  const before = rows()
  const textNodes = before.map(row => row.querySelector('.name')?.firstChild)

  mounted.update([
    ...data.slice(0, 1),
    {id: 2, name: 'Hopper', tone: 'b', on: true},
    {id: 3, name: 'Mary', tone: false, on: false},
  ])

  assert.deepEqual(rows(), before)
  assert.deepEqual(rows().map(row => row.outerHTML), [
    '<li class="row on"><b class="name">Ada</b><i class="tone" data-tone="a"></i></li>',
    '<li class="row on"><b class="name">Hopper</b><i class="tone" data-tone="b"></i></li>',
    '<li class="row"><b class="name">Mary</b><i class="tone"></i></li>',
  ])
  // A changed text keeps its text node.
  assert.deepEqual(
    rows().map(row => row.querySelector('.name')?.firstChild),
    textNodes,
  )

  // A row that comes back after a removal is a new occurrence.
  mounted.update(data.slice(2))
  mounted.update(data)
  assert.deepEqual(rows().map(row => row.outerHTML), [
    '<li class="row on"><b class="name">Ada</b><i class="tone" data-tone="a"></i></li>',
    '<li class="row"><b class="name">Grace</b><i class="tone" data-tone="b"></i></li>',
    '<li class="row"><b class="name">Mary</b><i class="tone" data-tone="c"></i></li>',
  ])
})

test('a new occurrence has the attribute order and the classes of the source', () => {
  const {mounted, rows} = mountRows(
    '<li class="row " data-a="1"><b class="name"><i></i></b>'
    + '<i data-tone="none" class="tone" title="t"></i></li>',
  )

  mounted.update([
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 2, name: '', tone: false, on: false},
    {id: 3, name: 'Grace', tone: 'c', on: true},
    {id: 4, name: '', tone: 'd', on: false},
    {id: 5, name: 'Mary', tone: 'e', on: true},
  ])

  const html = rows().map(row => row.outerHTML)
  const row = (/** @type {string} */ classes, /** @type {string} */ name, /** @type {string} */ tone) => {
    return `<li class="${classes}" data-a="1"><b class="name">${name}</b>`
      + `<i ${tone}class="tone" title="t"></i></li>`
  }

  // An empty text keeps the source element. A class that goes off leaves
  // the source `class` attribute.
  assert.deepEqual(html, [
    row('row on', 'Ada', 'data-tone="a" '),
    row('row ', '<i></i>', ''),
    row('row on', 'Grace', 'data-tone="c" '),
    row('row ', '<i></i>', 'data-tone="d" '),
    row('row on', 'Mary', 'data-tone="e" '),
  ])
})

test('a foreign write to a new occurrence stays until the projection changes', () => {
  const {mounted, rows} = mountRows()
  /** @type {Row[]} */
  const data = [
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 2, name: 'Grace', tone: 'b', on: false},
  ]

  mounted.update(data)

  const name = required(rows()[1]?.querySelector('.name'))
  const tone = required(rows()[1]?.querySelector('.tone'))

  name.textContent = 'foreign'
  tone.setAttribute('data-tone', 'foreign')
  mounted.update(data)
  assert.equal(name.textContent, 'foreign')
  assert.equal(tone.getAttribute('data-tone'), 'foreign')

  mounted.update([
    ...data.slice(0, 1),
    {id: 2, name: 'Hopper', tone: 'c', on: false},
  ])
  assert.equal(name.textContent, 'Hopper')
  assert.equal(tone.getAttribute('data-tone'), 'c')
})

test('a new occurrence does not find its targets before a value changes', () => {
  const {mounted, rows, window} = mountRows()
  /** @type {Row[]} */
  const data = Array.from({length: 6}, (_, id) => {
    return {id, name: `Name ${id}`, tone: 'a', on: false}
  })
  let walks = 0
  const descriptor = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(
      window.Element.prototype,
      'firstElementChild',
    )
  )

  Object.defineProperty(window.Element.prototype, 'firstElementChild', {
    configurable: true,
    get() {
      walks += 1
      return descriptor.get?.call(this)
    },
  })

  try {
    mounted.update(data)

    // The component root, the source element, and the fill element find
    // their targets.
    const afterFirst = walks

    assert.equal(afterFirst, 3)

    mounted.update(data)
    mounted.update([...data].reverse())
    assert.equal(walks, afterFirst)

    // One changed value: one occurrence finds its targets.
    mounted.update(data.map(row => row.id === 4 ? {...row, tone: 'b'} : row))
    assert.equal(walks, afterFirst + 1)
  } finally {
    Object.defineProperty(
      window.Element.prototype,
      'firstElementChild',
      descriptor,
    )
  }

  assert.equal(
    rows()[4]?.querySelector('.tone')?.getAttribute('data-tone'),
    'b',
  )
})

test('a projection gets the source element, not the fill element', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row" data-label="Row">Default</li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {string[]} */ (data), [
        text(':scope', ({item}, el) => `${el.textContent} ${item}`),
        attr(':scope', 'data-label', ({item}, el) => {
          return `${el.getAttribute('data-label')} ${item}`
        }),
      ]),
    ],
  }).mount(document.body)

  mounted.update(['a', 'b', 'c'])
  mounted.update(['a', 'b', 'c', 'd'])

  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.row'), row => row.outerHTML),
    ['a', 'b', 'c', 'd'].map(item => {
      return `<li class="row" data-label="Row ${item}">Default ${item}</li>`
    }),
  )
})

test('a text binding that contains another target fills each occurrence', () => {
  const {document} = createDocument()
  const mounted = component({
    source: createTemplate(
      document,
      '<ul><li class="row"><b class="inner">Inner</b></li></ul>',
    ),
    bindings: [
      repeat('.row', ({data}) => /** @type {string[]} */ (data), [
        attr('.inner', 'title', ({item}) => /** @type {string} */ (item)),
        text(':scope', ({item}) => /** @type {string} */ (item)),
      ]),
    ],
  }).mount(document.body)

  // The text write removes the inner element. The attribute binding keeps
  // the removed element, so later updates find it.
  mounted.update(['a', 'b'])
  mounted.update(['a2', 'b', 'c'])

  assert.deepEqual(
    Array.from(mounted.root.querySelectorAll('.row'), row => row.outerHTML),
    ['a2', 'b', 'c'].map(item => `<li class="row">${item}</li>`),
  )
})

test('nested occurrences get their values', () => {
  const {document} = createDocument()
  /** @typedef {{name: string, tags: string[]}} Group */
  /** @type {import('../src/index.js').ComponentOptions<Group[]>} */
  const options = {
    source: createTemplate(
      document,
      '<div><section class="group"><h2 class="name"></h2>'
      + '<span class="tag" data-tag=""></span></section></div>',
    ),
    bindings: [
      repeat('.group', ({data}) => data, [
        text('.name', fromItem(item => item.name)),
        repeat('.tag', fromItem(item => item.tags), [
          text(':scope', fromItem(item => item)),
          attr(':scope', 'data-tag', fromItem(item => item)),
        ]),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)
  const read = () => Array.from(
    mounted.root.querySelectorAll('.group'),
    group => [
      group.querySelector('.name')?.textContent,
      ...Array.from(group.querySelectorAll('.tag'), tag => {
        return `${tag.textContent}/${tag.getAttribute('data-tag')}`
      }),
    ],
  )

  mounted.update([
    {name: 'One', tags: ['a', 'b']},
    {name: 'Two', tags: ['c']},
  ])
  assert.deepEqual(read(), [['One', 'a/a', 'b/b'], ['Two', 'c/c']])

  mounted.update([
    {name: 'One', tags: ['a', 'x', 'b']},
    {name: 'Two', tags: []},
    {name: 'Three', tags: ['d', 'e']},
  ])
  assert.deepEqual(
    read(),
    [['One', 'a/a', 'x/x', 'b/b'], ['Two'], ['Three', 'd/d', 'e/e']],
  )
})

test('each mounted component has its own fill element', () => {
  const first = mountRows()
  const second = mountRows()

  first.mounted.update([{id: 1, name: 'Ada', tone: 'a', on: true}])
  second.mounted.update([
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 2, name: 'Grace', tone: 'b', on: false},
  ])
  first.mounted.update([
    {id: 1, name: 'Ada', tone: 'a', on: true},
    {id: 3, name: 'Mary', tone: 'c', on: true},
  ])

  assert.deepEqual(first.rows().map(row => row.textContent), ['Ada', 'Mary'])
  assert.deepEqual(second.rows().map(row => row.textContent), ['Ada', 'Grace'])
})

test('a write that fails for a new occurrence leaves the list unchanged', () => {
  const {document} = createDocument()
  /** @type {import('../src/index.js').ComponentOptions<string[]>} */
  const options = {
    source: createTemplate(document, '<ul><li class="row"></li></ul>'),
    bindings: [
      repeat('.row', ({data}) => data, ({item}) => item, [
        text(':scope', ({item}) => item),
        attr(':scope', ' bad name', ({item}) => item === 'bad' ? 'x' : null),
      ]),
    ],
  }
  const mounted = component(options).mount(document.body)
  const read = () => Array.from(
    mounted.root.querySelectorAll('.row'),
    row => row.textContent,
  )

  mounted.update(['a', 'b'])
  assert.throws(() => mounted.update(['a', 'bad', 'b']))
  assert.deepEqual(read(), ['a', 'b'])
})

test('a copy of the fill element is equal to a copy of the source', () => {
  const {document} = createDocument()
  const source = createTemplate(
    document,
    '<ul><li class="row base" data-fixed="1" lang="en">'
    + '<b class="name">Default</b><i class="note"></i>'
    + '<u title="t" class="tone" data-tone="none" hidden></u></li></ul>',
  )
  /** @typedef {Record<string, any> & {id: number}} Random */
  /** @type {ReadonlyArray<Binding<Random[]>>} */
  const rowBindings = [
    text('.name', fromItem(item => item.name)),
    text('.note', fromItem(item => item.note)),
    attr('.tone', 'data-tone', fromItem(item => item.tone)),
    attr('.tone', 'hidden', fromItem(item => item.hidden)),
    attr('.tone', 'data-new', fromItem(item => item.added)),
    attr(':scope', 'lang', fromItem(item => item.lang)),
    classToggle(':scope', 'base', fromItem(item => item.base)),
    classToggle(':scope', 'on', fromItem(item => item.on)),
    classToggle('.tone', 'tone', fromItem(item => item.toneClass)),
  ]
  /** @param {ReadonlyArray<Binding<Random[]>>} bindings */
  const mount = bindings => component({
    source,
    bindings: [
      repeat('.row', from(data => data), fromItem(item => item.id), bindings),
    ],
  }).mount(document.createElement('div'))
  const filled = mount(rowBindings)
  // A style binding stops the use of the fill element. Its nullish
  // projection writes nothing.
  const plain = mount([...rowBindings, style(':scope', 'color', () => null)])

  // A small generator with a fixed seed.
  let seed = 12345
  const random = (/** @type {number} */ limit) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
    return seed % limit
  }
  const pick = (/** @type {unknown[]} */ ...choices) => {
    return choices[random(choices.length)]
  }
  /** @type {Random[]} */
  let rows = []

  for (let step = 0; step < 150; step += 1) {
    // Remove some rows, change some rows, add some rows, then mix.
    rows = rows.filter(() => random(4) > 0)
    rows = rows.map(row => random(3) === 0 ? {...row, name: pick('x', '', 7)} : row)

    for (let count = random(6); count > 0; count -= 1) {
      rows.push({
        id: step * 10 + count,
        name: pick('Ada', '', 3, null, 'Default'),
        note: pick('', 'n', undefined),
        tone: pick('a', 'b', '', false, true, null),
        hidden: pick(true, false, null),
        added: pick('x', false, null, 'y'),
        lang: pick('en', 'fi', false, null),
        base: pick(true, false, null),
        on: pick(true, false, null),
        toneClass: pick(true, false),
      })
    }
    rows = rows.map(row => ({row, at: random(1000)}))
      .sort((left, right) => left.at - right.at)
      .map(({row}) => row)

    filled.update(rows)
    plain.update(rows)
    assert.equal(filled.root.innerHTML, plain.root.innerHTML, `step ${step}`)
  }
})
