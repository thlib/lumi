import {mountApplication} from './application'
import {connectPage} from './page'

if (document.readyState === 'complete') {
  start()
} else {
  document.addEventListener('DOMContentLoaded', start, {once: true})
}

function start(): void {
  connectPage(mountApplication(document.querySelector('#app')))
}
