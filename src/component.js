// @ts-check

import { assertElement, cloneTemplateRoot } from './dom.js'

/**
 * Defines a reusable component without changing its template.
 *
 * @template Data
 * @param {import('./types.js').ComponentOptions<Data>} options
 * @returns {import('./types.js').Component<Data>}
 */
export function component(options) {
  const bindings = [
    ...(options.bindings ?? []),
    ...(options.events ?? []),
  ]

  return Object.freeze({
    mount(target) {
      assertElement(target, 'mount target')
      const root = cloneTemplateRoot(options.template)
      target.append(root)

      try {
        return connectComponent(root, bindings)
      } catch (error) {
        root.remove()
        throw error
      }
    },

    adopt(root) {
      assertElement(root, 'adopted root')
      return connectComponent(root, bindings)
    },
  })
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<import('./types.js').Binding<Data>>} bindings
 * @returns {import('./types.js').MountedComponent<Data>}
 */
function connectComponent(root, bindings) {
  /** @type {{ hasData: false } | { hasData: true, data: Data }} */
  let dataState = { hasData: false }
  let isMounted = true
  let isRendering = false

  /** @type {import('./types.js').BindingContext<Data>} */
  const context = {
    data() {
      if (!isMounted) {
        throw new Error('Cannot read data from an unmounted Lumi component')
      }

      if (!dataState.hasData) {
        throw new Error('Lumi events are unavailable before the first render')
      }

      return dataState.data
    },
  }

  /** @type {Array<import('./types.js').ConnectedBinding<Data>>} */
  const connected = []

  try {
    for (const binding of bindings) {
      connected.push(binding.connect(root, context))
    }
  } catch (error) {
    for (let index = connected.length - 1; index >= 0; index -= 1) {
      connected[index]?.destroy()
    }
    throw error
  }

  return {
    root,

    render(data) {
      if (!isMounted) {
        throw new Error('Cannot render an unmounted Lumi component')
      }

      if (isRendering) {
        throw new Error('Cannot render a Lumi component recursively')
      }

      isRendering = true

      try {
        for (const binding of connected) {
          binding.render(data)
        }
        dataState = { hasData: true, data }
      } finally {
        isRendering = false
      }
    },

    unmount() {
      if (!isMounted) {
        return
      }

      for (let index = connected.length - 1; index >= 0; index -= 1) {
        connected[index]?.destroy()
      }

      root.remove()
      isMounted = false
    },
  }
}
