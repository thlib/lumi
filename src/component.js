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
  const bindings = options.bindings ?? []

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
 * Mounts one component and renders its initial data snapshot.
 *
 * @template Data
 * @param {Data} data
 * @param {import('./types.js').MountOptions<NoInfer<Data>>} options
 * @returns {import('./types.js').MountedComponent<Data>}
 */
export function mount(data, options) {
  const mounted = component(options).mount(options.target)

  try {
    mounted.render(data)
    return mounted
  } catch (error) {
    mounted.unmount()
    throw error
  }
}

/**
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<import('./types.js').Binding<Data>>} bindings
 * @returns {import('./types.js').MountedComponent<Data>}
 */
function connectComponent(root, bindings) {
  let isMounted = true
  let isRendering = false

  /** @type {Array<import('./types.js').ConnectedBinding<Data>>} */
  const connected = []

  /** @param {Data} data */
  function render(data) {
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
    } finally {
      isRendering = false
    }
  }

  try {
    for (const binding of bindings) {
      connected.push(binding.connect(root))
    }
  } catch (error) {
    for (let index = connected.length - 1; index >= 0; index -= 1) {
      connected[index]?.destroy()
    }
    throw error
  }

  return {
    root,
    render,

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
