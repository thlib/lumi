// @ts-check

import {mountApplication} from './application.js'
import {connectPage} from './page.js'

if (document.readyState === 'complete') {
  start()
} else {
  document.addEventListener('DOMContentLoaded', start, {once: true})
}

function start() {
  const target = document.querySelector('#app')
  const application = mountApplication(target)

  connectPage(application)
}
