// @ts-check

import { findElement } from './dom.js'

const noOperation = () => {}

/**
 * Projects data into an element's textContent.
 *
 * @template Data
 * @param {string} selector
 * @param {(data: Data) => string | number | boolean} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function text(selector, project) {
  return {
    connect(root) {
      const element = findElement(root, selector)
      let previous = element.textContent ?? ''

      return {
        render(data) {
          const next = String(project(data))

          if (next === previous) {
            return
          }

          element.textContent = next
          previous = next
        },
        destroy: noOperation,
      }
    },
  }
}

/**
 * Projects data into a native DOM property.
 *
 * @template Data
 * @template Value
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data) => Value} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function property(selector, name, project) {
  return {
    connect(root) {
      const element = findElement(root, selector)
      /** @type {{ hasValue: false } | { hasValue: true, value: Value }} */
      let state = { hasValue: false }

      return {
        render(data) {
          const value = project(data)
          const previous = state.hasValue
            ? state.value
            : Reflect.get(element, name)

          if (Object.is(value, previous)) {
            state = { hasValue: true, value }
            return
          }

          if (!Reflect.set(element, name, value)) {
            throw new TypeError(
              `Lumi could not set property "${name}" on <${element.localName}>`,
            )
          }

          state = { hasValue: true, value }
        },
        destroy: noOperation,
      }
    },
  }
}

/**
 * Projects false to an absent attribute, true to an empty attribute, and
 * strings or numbers to their text representation.
 *
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data) => string | number | boolean} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function attribute(selector, name, project) {
  return {
    connect(root) {
      const element = findElement(root, selector)
      /** @type {string | false} */
      let previous = element.hasAttribute(name)
        ? element.getAttribute(name) ?? ''
        : false

      return {
        render(data) {
          const projected = project(data)
          const next = projected === false
            ? false
            : projected === true
              ? ''
              : String(projected)

          if (next === previous) {
            return
          }

          if (next === false) {
            element.removeAttribute(name)
          } else {
            element.setAttribute(name, next)
          }

          previous = next
        },
        destroy: noOperation,
      }
    },
  }
}

/**
 * Toggles one class without replacing classes owned by HTML or other code.
 *
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data) => boolean} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function classToggle(selector, name, project) {
  return {
    connect(root) {
      const element = findElement(root, selector)
      let previous = element.classList.contains(name)

      return {
        render(data) {
          const next = project(data)

          if (next === previous) {
            return
          }

          element.classList.toggle(name, next)
          previous = next
        },
        destroy: noOperation,
      }
    },
  }
}

/**
 * Projects data into one inline style property without replacing the style
 * attribute.
 *
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data) => string} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function style(selector, name, project) {
  return {
    connect(root) {
      const element = findElement(root, selector)

      if (!('style' in element)) {
        throw new TypeError(
          `Lumi style binding requires a styled element, received <${element.localName}>`,
        )
      }

      const styledElement = /** @type {HTMLElement | SVGElement} */ (element)
      let previous = styledElement.style.getPropertyValue(name)

      return {
        render(data) {
          const next = project(data)

          if (next === previous) {
            return
          }

          if (next === '') {
            styledElement.style.removeProperty(name)
          } else {
            styledElement.style.setProperty(name, next)
          }

          previous = next
        },
        destroy: noOperation,
      }
    },
  }
}

/**
 * Installs one stable native listener during the first render and reads the
 * latest rendered data thereafter.
 *
 * @template Data
 * @param {string} selector
 * @param {string} type
 * @param {(context: import('./types.js').EventContext<Data>) => void} handle
 * @param {boolean | AddEventListenerOptions} [options]
 * @returns {import('./types.js').Binding<Data>}
 */
export function on(selector, type, handle, options = false) {
  return {
    connect(root, context) {
      const element = findElement(root, selector)
      let isListening = false
      /** @param {Event} event */
      const listener = (event) => {
        handle({
          data: context.data(),
          element,
          event,
          root,
        })
      }

      return {
        render() {
          if (isListening) {
            return
          }

          element.addEventListener(type, listener, options)
          isListening = true
        },
        destroy() {
          if (!isListening) {
            return
          }

          element.removeEventListener(type, listener, options)
          isListening = false
        },
      }
    },
  }
}

/**
 * Mounts one nested component and projects parent data into it.
 *
 * The selected container owns the child root and must not contain another
 * element when connected.
 *
 * @template ParentData
 * @template ChildData
 * @param {string} selector
 * @param {import('./types.js').Component<ChildData>} childComponent
 * @param {(data: ParentData) => ChildData} project
 * @returns {import('./types.js').Binding<ParentData>}
 */
export function child(selector, childComponent, project) {
  return {
    connect(root) {
      const container = findElement(root, selector)

      if (container.childElementCount !== 0) {
        throw new Error(
          `Lumi child container "${selector}" must not contain an element`,
        )
      }

      const mounted = childComponent.mount(container)

      return {
        render(data) {
          mounted.render(project(data))
        },
        destroy() {
          mounted.unmount()
        },
      }
    },
  }
}

/**
 * Reconciles keyed data with persistent child component roots.
 *
 * The selected container owns all of its element children. Keys must be
 * unique strings or finite numbers for every render.
 *
 * @template ParentData
 * @template Item
 * @template {string | number} Key
 * @param {string} selector
 * @param {{
 *   items: (data: ParentData) => ReadonlyArray<Item>,
 *   key: (item: Item, index: number) => Key,
 *   component: import('./types.js').Component<Item>
 * }} options
 * @returns {import('./types.js').Binding<ParentData>}
 */
export function repeat(selector, options) {
  return {
    connect(root) {
      const container = findElement(root, selector)

      if (container.childElementCount !== 0) {
        throw new Error(
          `Lumi repeat container "${selector}" must not contain an element`,
        )
      }

      /** @type {Map<Key, import('./types.js').MountedComponent<Item>>} */
      const mountedByKey = new Map()

      return {
        render(data) {
          const items = options.items(data)

          if (!Array.isArray(items)) {
            throw new TypeError('Lumi repeat items must be an array')
          }

          const keyedItems = items.map((item, index) => ({
            item,
            key: options.key(item, index),
          }))
          const nextKeys = new Set()

          for (const keyedItem of keyedItems) {
            if (
              typeof keyedItem.key !== 'string'
              && (
                typeof keyedItem.key !== 'number'
                || !Number.isFinite(keyedItem.key)
              )
            ) {
              throw new TypeError(
                'Lumi repeat keys must be strings or finite numbers',
              )
            }

            if (nextKeys.has(keyedItem.key)) {
              throw new Error(
                `Lumi repeat received duplicate key "${keyedItem.key}"`,
              )
            }

            nextKeys.add(keyedItem.key)
          }

          for (const [key, mounted] of mountedByKey) {
            if (!nextKeys.has(key)) {
              mounted.unmount()
              mountedByKey.delete(key)
            }
          }

          for (const keyedItem of keyedItems) {
            let mounted = mountedByKey.get(keyedItem.key)

            if (mounted === undefined) {
              mounted = options.component.mount(container)
              mountedByKey.set(keyedItem.key, mounted)
            }

            mounted.render(keyedItem.item)
          }

          let cursor = container.firstElementChild

          for (const keyedItem of keyedItems) {
            const mounted = mountedByKey.get(keyedItem.key)

            if (mounted === undefined) {
              throw new Error(
                `Lumi lost repeated component "${keyedItem.key}" during render`,
              )
            }

            if (mounted.root === cursor) {
              cursor = cursor.nextElementSibling
            } else if (cursor === null) {
              if (container.lastElementChild !== mounted.root) {
                container.append(mounted.root)
              }
            } else {
              container.insertBefore(mounted.root, cursor)
            }
          }
        },

        destroy() {
          for (const mounted of mountedByKey.values()) {
            mounted.unmount()
          }
          mountedByKey.clear()
        },
      }
    },
  }
}
