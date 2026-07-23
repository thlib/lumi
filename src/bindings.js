// @ts-check

import { findElement } from './dom.js'
import {
  longestIncreasingSubsequencePositions,
  moveElementBefore,
} from './reconcile.js'

const noOperation = () => {}
const unsafePropertyNames = new Set([
  'innerhtml',
  'outerhtml',
])

/**
 * Keeps raw HTML content and native event handlers out of generic bindings.
 *
 * @param {'attribute' | 'property'} kind
 * @param {string} name
 */
function assertSafeBindingName(kind, name) {
  const normalizedName = name.toLowerCase()

  if (normalizedName.startsWith('on')) {
    throw new TypeError(
      `Lumi ${kind} binding "${name}" is an event handler; use on()`,
    )
  }

  if (
    normalizedName === 'srcdoc'
    || (kind === 'property' && unsafePropertyNames.has(normalizedName))
  ) {
    throw new TypeError(
      `Lumi ${kind} binding "${name}" requires an explicit trusted-content API`,
    )
  }
}

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
 * Projects data into a native DOM property and reconciles against its live
 * value on every render.
 *
 * Native event handlers and trusted-content sinks require explicit APIs.
 *
 * @template Data
 * @template Value
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data) => Value} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When name is an event handler or trusted-content sink.
 */
export function property(selector, name, project) {
  assertSafeBindingName('property', name)

  return {
    connect(root) {
      const element = findElement(root, selector)
      /**
       * DOM setters may coerce a projected value. Remember both sides so an
       * unchanged coerced value can be skipped without ignoring DOM drift.
       *
       * @type {{
       *   hasValue: false
       * } | {
       *   hasValue: true,
       *   projectedValue: Value,
       *   domValue: unknown
       * }}
       */
      let state = { hasValue: false }

      return {
        render(data) {
          const value = project(data)
          const domValue = Reflect.get(element, name)

          if (
            Object.is(value, domValue)
            || (
              state.hasValue
              && Object.is(value, state.projectedValue)
              && Object.is(domValue, state.domValue)
            )
          ) {
            state = {
              hasValue: true,
              projectedValue: value,
              domValue,
            }
            return
          }

          if (!Reflect.set(element, name, value)) {
            throw new TypeError(
              `Lumi could not set property "${name}" on <${element.localName}>`,
            )
          }

          state = {
            hasValue: true,
            projectedValue: value,
            domValue: Reflect.get(element, name),
          }
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
 * Native event handlers and trusted-content sinks require explicit APIs.
 *
 * @template Data
 * @param {string} selector
 * @param {string} name
 * @param {(data: Data) => string | number | boolean} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When name is an event handler or trusted-content sink.
 */
export function attribute(selector, name, project) {
  assertSafeBindingName('attribute', name)

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
 * unique strings or finite numbers for every render. Reorders preserve the
 * longest stable subsequence and use native state-preserving moves when
 * available.
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

          /** @type {Map<Element, number>} */
          const oldPositionByRoot = new Map()
          let position = 1

          for (const childElement of container.children) {
            oldPositionByRoot.set(childElement, position)
            position += 1
          }

          for (const [key, mounted] of mountedByKey) {
            if (!nextKeys.has(key)) {
              mounted.unmount()
              mountedByKey.delete(key)
            }
          }

          /** @type {Array<import('./types.js').MountedComponent<Item>>} */
          const orderedMounted = []
          /** @type {number[]} */
          const oldPositions = []
          let highestOldPosition = 0
          let hasMoved = false

          for (const keyedItem of keyedItems) {
            let mounted = mountedByKey.get(keyedItem.key)

            if (mounted === undefined) {
              mounted = options.component.mount(container)
              mountedByKey.set(keyedItem.key, mounted)
            }

            const oldPosition = oldPositionByRoot.get(mounted.root) ?? 0

            if (oldPosition !== 0) {
              if (oldPosition < highestOldPosition) {
                hasMoved = true
              } else {
                highestOldPosition = oldPosition
              }
            }

            orderedMounted.push(mounted)
            oldPositions.push(oldPosition)
            mounted.render(keyedItem.item)
          }

          const stablePositions = hasMoved
            ? longestIncreasingSubsequencePositions(oldPositions)
            : null

          for (let index = orderedMounted.length - 1; index >= 0; index -= 1) {
            const mounted = orderedMounted[index]
            if (mounted === undefined) {
              throw new Error('Lumi lost a repeated component during render')
            }

            const anchor = orderedMounted[index + 1]?.root ?? null
            const oldPosition = oldPositions[index]
            const requiresPlacement = oldPosition === 0
              || (
                stablePositions !== null
                && !stablePositions.has(index)
              )

            if (
              requiresPlacement
              && mounted.root.nextElementSibling !== anchor
            ) {
              moveElementBefore(container, mounted.root, anchor)
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
