import {mountApplication} from './application'
import {connectPage} from './page'

// Safari does not have moveBefore(), which a keyed repeat uses to move an
// element. Only a browser that needs the shim loads it.
if (!('moveBefore' in Element.prototype)) {
  await import('../../../../src/shims/move-before.js')
}

if (document.readyState === 'complete') {
  start()
} else {
  document.addEventListener('DOMContentLoaded', start, {once: true})
}

function start(): void {
  connectPage(mountApplication(document.querySelector('#app')))
}
