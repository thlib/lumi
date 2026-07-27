// @ts-check

/**
 * The demo's module entry.
 *
 * Every template in index.html declares its behavior in a script beside it,
 * and each of those scripts imports from this one module. One entry keeps the
 * page to a single module graph and lets the optional bundled build replace it
 * with one file without changing a template or a script.
 *
 * The first group of exports is Lumi's public API, re-exported unchanged. The
 * rest belongs to this demo.
 */

export {
  attr,
  classToggle,
  component,
  on,
  prop,
  repeat,
  style,
  text,
} from '../../src/index.js'

export {define, resolve} from './demo-components.js'
export {update} from './page.js'
export {emailValidationMessage} from './validation.js'
export {
  filterLargeRecords,
  largeRecords,
  orderLargeRecords,
  recordFilters,
} from './large-data.js'

import {mountApplication} from './application.js'
import {connectPage} from './page.js'

if (document.readyState === 'complete') {
  start()
} else {
  document.addEventListener('DOMContentLoaded', start, {once: true})
}

function start() {
  connectPage(mountApplication(document.querySelector('#app')))
}
