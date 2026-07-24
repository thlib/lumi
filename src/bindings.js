// @ts-check

import { findElement, queryElements } from './dom.js'
import { prepareMounted } from './component.js'
import { claimDomSubtree, createDomBinding } from './plan.js'

const noOperation = () => {}
const noOperationUpdate = Object.freeze({ commit: noOperation })

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * @template Data
 * @template Value
 * @template {Element} [Target=Element]
 * @typedef {(data: Data, element: Target) => Value} ScalarProjection
 */

/**
 * Resolves a bare HTML, SVG, or MathML tag selector to the same element type
 * exposed by the DOM query APIs. Complex selectors safely fall back to
 * Element.
 *
 * @template {string} Selector
 * @typedef {Selector extends keyof HTMLElementTagNameMap
 *   ? HTMLElementTagNameMap[Selector]
 *   : Selector extends keyof SVGElementTagNameMap
 *     ? SVGElementTagNameMap[Selector]
 *     : Selector extends keyof MathMLElementTagNameMap
 *       ? MathMLElementTagNameMap[Selector]
 *       : Selector extends keyof HTMLElementDeprecatedTagNameMap
 *         ? HTMLElementDeprecatedTagNameMap[Selector]
 *         : Element} SelectorElement
 */

/**
 * Resolves a known native event name to its specific event type.
 *
 * @template {string} Type
 * @typedef {Type extends keyof GlobalEventHandlersEventMap
 *   ? GlobalEventHandlersEventMap[Type]
 *   : Event} NativeEvent
 */

/**
 * Keeps iframe documents and native event handlers out of generic bindings.
 *
 * @param {'attribute' | 'property'} kind
 * @param {string} name
 */
function assertSafeBindingName(kind, name) {
  const normalizedName = name.toLowerCase()

  if (normalizedName.startsWith('on')) {
    throw new TypeError(
      `Lumi ${kind} binding "${name}" is an event handler; use event()`,
    )
  }

  if (normalizedName === 'srcdoc') {
    throw new TypeError(
      `Lumi ${kind} binding "${name}" requires an explicit trusted-content API`,
    )
  }
}

/**
 * Binds projected data to an element.
 *
 * The projection receives the matching element in Lumi's prepared DOM so
 * application code may inject conventions such as reading a data attribute.
 * Lumi does not interpret those attributes.
 *
 * Text values write textContent. Arrays repeat the matched element
 * positionally. Nested arrays are consumed by nested bind declarations,
 * while scalar descendant projections broadcast through inherited array
 * coordinates. A nullish projection performs no DOM operation.
 *
 * @template Data
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {ScalarProjection<Data, TextValue | null | undefined | ReadonlyArray<unknown>, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When a scalar projection returns a non-text value.
 */
export function bind(selector, project) {
  return createDomBinding({
    kind: 'bind',
    selector,
    project: /** @type {(data: Data, element: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
  })
}

/**
 * Delegates one native event to the closest matching element inside the
 * component boundary. Delegation keeps the handler active for matching
 * elements created by later structural updates.
 *
 * The listener is installed when the component mounts and removed when it
 * unmounts. Native listener options are passed through unchanged.
 *
 * @template Data
 * @template {string} [Selector=string]
 * @template {string} [Type=string]
 * @param {Selector} selector
 * @param {Type} type
 * @param {(event: NativeEvent<Type>, element: SelectorElement<Selector>) => void} handle
 * @param {boolean | AddEventListenerOptions} [options]
 * @returns {import('./types.js').Binding<Data>}
 */
export function event(selector, type, handle, options = false) {
  return {
    connect(root) {
      // Validate the selector during connection, including when it currently
      // has no matches, so mount remains atomic.
      queryElements(root, selector)

      /** @param {Event} nativeEvent */
      const listener = nativeEvent => {
        const matches = new Set(queryElements(root, selector))

        for (const target of nativeEvent.composedPath()) {
          if (
            typeof target === 'object'
            && target !== null
            && 'nodeType' in target
            && target.nodeType === 1
            && matches.has(/** @type {Element} */ (target))
          ) {
            handle(
              /** @type {NativeEvent<Type>} */ (nativeEvent),
              /** @type {SelectorElement<Selector>} */ (target),
            )
            return
          }

          if (target === root) {
            return
          }
        }
      }

      root.addEventListener(type, listener, options)

      return {
        prepare() {
          return noOperationUpdate
        },
        destroy() {
          root.removeEventListener(type, listener, options)
        },
      }
    },
  }
}

/**
 * Projects data into a native DOM property and reconciles against its live
 * value on every render. A nullish projection performs no DOM operation.
 *
 * Native event handlers and srcdoc are not supported by generic bindings.
 * innerHTML and outerHTML projections must return a genuine TrustedHTML value
 * created by a policy in a browser that implements the Trusted Types API.
 *
 * @template Data
 * @template Value
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {ScalarProjection<Data, Value | null | undefined, SelectorElement<Selector>>} project
 * @param {string} name
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When name is an event handler or srcdoc, or an
 * innerHTML/outerHTML projection does not return TrustedHTML.
 */
export function prop(selector, project, name) {
  assertSafeBindingName('property', name)

  return createDomBinding({
    kind: 'property',
    selector,
    project: /** @type {(data: Data, element: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    name,
  })
}

/**
 * Projects false to an absent attribute, true to an empty attribute, and
 * strings or numbers to their text representation. A nullish projection
 * performs no DOM operation.
 *
 * Native event handlers and srcdoc are not supported by generic bindings.
 *
 * @template Data
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {string} name
 * @param {ScalarProjection<Data, TextValue | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When name is an event handler or srcdoc, or a projection
 * returns a non-text value.
 */
export function attr(selector, name, project) {
  assertSafeBindingName('attribute', name)

  return createDomBinding({
    kind: 'attribute',
    selector,
    project: /** @type {(data: Data, element: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    name,
  })
}

/**
 * Toggles one class without replacing classes owned by HTML or other code. A
 * nullish projection performs no DOM operation.
 *
 * @template Data
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {string} name
 * @param {ScalarProjection<Data, boolean | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When a projection does not return a boolean.
 */
export function classToggle(selector, name, project) {
  return createDomBinding({
    kind: 'class',
    selector,
    project: /** @type {(data: Data, element: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    name,
  })
}

/**
 * Projects data into one inline style property without replacing the style
 * attribute. A nullish projection performs no DOM operation.
 *
 * @template Data
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {string} name
 * @param {ScalarProjection<Data, string | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When a projection does not return a string.
 */
export function style(selector, name, project) {
  return createDomBinding({
    kind: 'style',
    selector,
    project: /** @type {(data: Data, element: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    name,
  })
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

      return claimDomSubtree({
        prepare(data) {
          return prepareMounted(mounted, project(data))
        },
        destroy() {
          mounted.unmount()
        },
      }, container)
    },
  }
}
