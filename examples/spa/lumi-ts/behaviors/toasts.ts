import {on} from '../../../../dist/lumi.js'
import {update} from '../page'

import type {Binding} from '../../../../dist/types.js'
import type {Presentation} from '../presentation'

let nextToastId = 1
const toastTimers = new Map<string, number>()

export const toastBehaviors: ReadonlyArray<Binding<Presentation>> = [
  on<string, 'submit', Presentation>(
    '[data-toast="create"]',
    'submit',
    event => {
      if (event.defaultPrevented) {
        return
      }

      event.preventDefault()
      const toast = {
        id: `toast-${nextToastId++}`,
        message: 'No server for demo',
      }

      update(data => ({...data, toasts: [...data.toasts, toast]}))

      const timer = window.setTimeout(() => {
        toastTimers.delete(toast.id)
        update(data => ({
          ...data,
          toasts: data.toasts.filter(item => item.id !== toast.id),
        }))
      }, 3200)
      toastTimers.set(toast.id, timer)
    },
  ),
  on<string, 'click', Presentation>(
    '[data-toast="close"]',
    'click',
    (event, element) => {
      const id = element.getAttribute('data-toast-id')

      if (id === null) {
        return
      }

      window.clearTimeout(toastTimers.get(id))
      toastTimers.delete(id)
      update(data => ({
        ...data,
        toasts: data.toasts.filter(item => item.id !== id),
      }))
    },
  ),
]
