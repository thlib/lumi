// @ts-check

import { performance } from 'node:perf_hooks'
import { JSDOM } from 'jsdom'
import { bind, component } from '../src/index.js'

const WARMUP_UPDATES = 100
const SCALAR_UPDATES = 2_000
const LIST_GROWTH_RUNS = 50
const LIST_SIZE = 32

/**
 * @returns {{ document: Document, close: () => void }}
 */
function createDocument() {
  const { window } = new JSDOM()

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
 * @returns {HTMLTemplateElement}
 */
function createTemplate(document, markup) {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template
}

/**
 * @param {string} name
 * @param {number} operations
 * @param {() => void} run
 */
function measure(name, operations, run) {
  const start = performance.now()
  run()
  const elapsed = performance.now() - start
  const microsecondsPerOperation = (elapsed * 1_000) / operations

  console.log(
    `${name}: ${elapsed.toFixed(2)} ms (${microsecondsPerOperation.toFixed(2)} µs/update; ${operations} updates)`,
  )
}

function benchmarkScalarUpdates() {
  const { document, close } = createDocument()

  try {
    const target = document.createElement('div')
    const mounted = component({
      template: createTemplate(document, '<output class="value">0</output>'),
      bindings: [bind('.value', data => data.value)],
    }).mount(target)

    for (let value = 0; value < WARMUP_UPDATES; value += 1) {
      mounted.update({ value })
    }

    measure('scalar updates', SCALAR_UPDATES, () => {
      for (let value = 0; value < SCALAR_UPDATES; value += 1) {
        mounted.update({ value })
      }
    })

    const value = mounted.root.textContent
    if (value !== String(SCALAR_UPDATES - 1)) {
      throw new Error(`Unexpected scalar result: ${value}`)
    }

    mounted.unmount()
  } finally {
    close()
  }
}

function benchmarkPositionalListGrowth() {
  const { document, close } = createDocument()

  try {
    const template = createTemplate(
      document,
      '<ul><li class="item">default</li></ul>',
    )
    const target = document.createElement('div')

    // Activate the positional-list planner before measuring growth.
    const warmup = component({
      template,
      bindings: [bind('.item', data => data.items)],
    }).mount(target)
    warmup.update({ items: [] })
    warmup.unmount()

    measure('positional-list growth', LIST_GROWTH_RUNS * LIST_SIZE, () => {
      for (let run = 0; run < LIST_GROWTH_RUNS; run += 1) {
        const mounted = component({
          template,
          bindings: [bind('.item', data => data.items)],
        }).mount(target)

        mounted.update({ items: [] })

        for (let size = 1; size <= LIST_SIZE; size += 1) {
          mounted.update({
            items: Array.from({ length: size }, (_, index) => index),
          })
        }

        if (mounted.root.querySelectorAll('.item').length !== LIST_SIZE) {
          throw new Error('Unexpected positional-list length')
        }

        mounted.unmount()
      }
    })
  } finally {
    close()
  }
}

console.log('Lumi performance baseline (Node + jsdom)')
benchmarkScalarUpdates()
benchmarkPositionalListGrowth()
