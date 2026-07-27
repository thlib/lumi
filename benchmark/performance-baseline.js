// @ts-check

import {performance} from 'node:perf_hooks'
import {JSDOM} from 'jsdom'
import {component, on, repeat, text} from '../src/index.js'

const SAMPLE_COUNT = 7

/**
 * @typedef {{
 *   close: () => void,
 *   operations: number,
 *   run: (iteration: number) => void,
 *   validate: () => void,
 *   warmup: number,
 * }} Scenario
 */

/**
 * @returns {{document: Document, close: () => void}}
 */
function createDocument() {
  const {window} = new JSDOM()

  return {
    document: window.document,
    close() {
      window.close()
    },
  }
}

/**
 * @param {Document} document
 * @param {string} markup
 */
function createTemplate(document, markup) {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template
}

/**
 * @param {string} name
 * @param {() => Scenario} createScenario
 */
function benchmark(name, createScenario) {
  const scenario = createScenario()

  try {
    for (let iteration = 0; iteration < scenario.warmup; iteration += 1) {
      scenario.run(iteration)
    }

    /** @type {number[]} */
    const samples = []

    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const start = performance.now()

      for (
        let iteration = 0;
        iteration < scenario.operations;
        iteration += 1
      ) {
        scenario.run(iteration + sample * scenario.operations)
      }

      samples.push(
        ((performance.now() - start) * 1_000) / scenario.operations,
      )
    }

    scenario.validate()
    const sorted = [...samples].sort((left, right) => left - right)
    const median = percentile(sorted, 0.5)
    const p95 = percentile(sorted, 0.95)

    console.log(
      `${name.padEnd(32)} ${median.toFixed(2).padStart(8)} µs/update `
      + `(p95 ${p95.toFixed(2)}; ${scenario.operations} updates/sample)`,
    )
  } finally {
    scenario.close()
  }
}

/**
 * @param {ReadonlyArray<number>} sorted
 * @param {number} percentileValue
 */
function percentile(sorted, percentileValue) {
  const position = (sorted.length - 1) * percentileValue
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = sorted[lowerIndex]
  const upper = sorted[upperIndex]

  if (lower === undefined || upper === undefined) {
    throw new Error('Cannot calculate a percentile without samples')
  }

  return lower + (upper - lower) * (position - lowerIndex)
}

/**
 * @param {{bindings: number, changing: boolean}} options
 * @returns {Scenario}
 */
function scalarScenario({bindings: bindingCount, changing}) {
  const {document, close} = createDocument()
  const markup = Array.from(
    {length: bindingCount},
    (_, index) => `<output class="value-${index}"></output>`,
  ).join('')
  const bindings = Array.from({length: bindingCount}, (_, index) => {
    return text(`.value-${index}`, ({data}) => /** @type {string} */ (data))
  })
  const mounted = component({
    template: createTemplate(document, `<section>${markup}</section>`),
    bindings,
  }).mount(document.createElement('div'))

  return {
    operations: bindingCount === 1 ? 10_000 : 2_000,
    warmup: bindingCount === 1 ? 1_000 : 300,
    run(iteration) {
      mounted.update(changing ? String(iteration) : 'same')
    },
    validate() {
      const values = mounted.root.querySelectorAll('output')
      if (values.length !== bindingCount) {
        throw new Error(`Expected ${bindingCount} scalar targets`)
      }
    },
    close() {
      mounted.unmount()
      close()
    },
  }
}

/**
 * @param {boolean} changing
 * @returns {Scenario}
 */
function multiMatchScenario(changing) {
  const {document, close} = createDocument()
  const markup = '<output class="value"></output>'.repeat(32)
  const mounted = component({
    template: createTemplate(document, `<section>${markup}</section>`),
    bindings: [text('.value', ({data}) => /** @type {string} */ (data))],
  }).mount(document.createElement('div'))

  return {
    operations: 5_000,
    warmup: 500,
    run(iteration) {
      mounted.update(changing ? String(iteration) : 'same')
    },
    validate() {
      if (mounted.root.querySelectorAll('.value').length !== 32) {
        throw new Error('Expected 32 multi-match targets')
      }
    },
    close() {
      mounted.unmount()
      close()
    },
  }
}

/**
 * @param {boolean} resize
 * @returns {Scenario}
 */
function listScenario(resize) {
  const {document, close} = createDocument()
  const mounted = component({
    template: createTemplate(
      document,
      '<ul><li class="item">default</li></ul>',
    ),
    bindings: [
      repeat('.item', ({data}) => /** @type {string[]} */ (data)),
      text('.item', ({item}) => item),
    ],
  }).mount(document.createElement('div'))
  const values = Array.from({length: 32}, (_, index) => String(index))
  const sizes = Array.from(
    {length: 64},
    (_, index) => index < 32 ? index + 1 : 64 - index,
  )
  const snapshots = sizes.map(size => values.slice(0, size))

  mounted.update([])

  return {
    operations: 3_000,
    warmup: 300,
    run(iteration) {
      const snapshot = resize
        ? snapshots[iteration % snapshots.length] ?? []
        : values
      mounted.update(snapshot)
    },
    validate() {
      const expected = resize
        ? sizes[(SAMPLE_COUNT * 3_000 - 1) % sizes.length]
        : 32
      if (mounted.root.querySelectorAll('.item').length !== expected) {
        throw new Error(`Expected ${expected} positional list items`)
      }
    },
    close() {
      mounted.unmount()
      close()
    },
  }
}

/** @returns {Scenario} */
function routedEventScenario() {
  const {document, close} = createDocument()
  const inertNodes = '<button type="button">Action</button>'.repeat(100)
  const mounted = component({
    template: createTemplate(
      document,
      `<section><output class="value"></output>${inertNodes}</section>`,
    ),
    bindings: [
      text('.value', ({data}) => /** @type {string} */ (data)),
      on('button', 'click', () => {}),
    ],
  }).mount(document.createElement('div'))

  return {
    operations: 5_000,
    warmup: 500,
    run() {
      mounted.update('same')
    },
    validate() {
      if (mounted.root.querySelectorAll('button').length !== 100) {
        throw new Error('Expected 100 routed event targets')
      }
    },
    close() {
      mounted.unmount()
      close()
    },
  }
}

console.log(`Lumi performance baseline (Node + jsdom, ${SAMPLE_COUNT} samples)`)
benchmark('scalar unchanged', () => {
  return scalarScenario({bindings: 1, changing: false})
})
benchmark('scalar changing', () => {
  return scalarScenario({bindings: 1, changing: true})
})
benchmark('20 bindings unchanged', () => {
  return scalarScenario({bindings: 20, changing: false})
})
benchmark('20 bindings changing', () => {
  return scalarScenario({bindings: 20, changing: true})
})
benchmark('32 matches unchanged', () => multiMatchScenario(false))
benchmark('32 matches changing', () => multiMatchScenario(true))
benchmark('positional list stable (32)', () => listScenario(false))
benchmark('positional list resize (0-32)', () => listScenario(true))
benchmark('routed event topology (100)', routedEventScenario)
