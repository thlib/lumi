// @ts-check

/**
 * The demo's module entry.
 *
 * Every native component document keeps its template beside a TypeScript
 * behavior module. The SPA build treats those behavior files as ordinary modules that
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

function start(): void {
  connectPage(mountApplication(document.querySelector('#app')))
}
