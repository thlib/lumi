// @ts-check

/**
 * The demo's module entry.
 *
 * Every native component document keeps its template beside an inline behavior
 * module. The SPA build treats those behavior blocks as ordinary modules that
 * import from this facade, then bundles the complete graph into one file.
 *
 * The first group exposes the Lumi bindings used by component documents.
 * Component creation belongs to the demo's placement plan. The rest belongs
 * to this demo.
 */

export {
  attr,
  classToggle,
  on,
  prop,
  repeat,
  style,
  text,
} from '../../../dist/lumi.js'

export {overviewDetails} from './navigation.js'
export {update} from './page.js'
export {emailValidationMessage} from './validation.js'
export {
  filterLargeRecords,
  largeRecords,
  orderLargeRecords,
  recordFilters,
} from './records.js'

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
