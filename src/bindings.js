// @ts-check

import { findElement } from './dom.js'
import { prepareMounted } from './component.js'
import {
  claimDomSubtree,
  createDomBinding,
  getDomBindingDescriptor,
} from './plan.js'

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * @template Item
 * @template [Data=unknown]
 * @template [Value=unknown]
 * @template {Element} [Target=Element]
 * @typedef {(
 *   context: import('./types.js').ProjectionContext<Item, Data>,
 *   el: Target,
 * ) => Value} ContextProjection
 */

/**
 * @template Item
 * @template [Data=unknown]
 * @typedef {(
 *   context: import('./types.js').ProjectionContext<Item, Data>,
 * ) => unknown} KeyProjection
 */

/**
 * @template {string} Selector
 * @typedef {import('./types.js').SelectorElement<Selector>} SelectorElement
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
      `Lumi ${kind} binding "${name}" is an event handler; use on()`,
    )
  }

  if (normalizedName === 'srcdoc') {
    throw new TypeError(
      `Lumi ${kind} binding "${name}" requires an explicit trusted-content API`,
    )
  }
}

/**
 * Repeats the matched template element once for every projected item.
 *
 * The projection receives the nearest positional occurrence. At the
 * component boundary, context.item is the component data. A nullish or
 * non-array result preserves the current region. Built-in DOM bindings in
 * the final argument resolve selectors inside each repeated occurrence and
 * receive that occurrence's context. An optional key projection before the
 * bindings keeps occurrence identity with an item when its position changes.
 *
 * @template Item
 * @template [Data=unknown]
 * @template [Parent=Data]
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {ContextProjection<Parent, Data, ReadonlyArray<Item> | null | undefined, SelectorElement<Selector>>} project
 * @param {KeyProjection<Item, Data> | ReadonlyArray<import('./types.js').Binding<Data>>} [keyOrBindings]
 * @param {ReadonlyArray<import('./types.js').Binding<Data>>} [bindings]
 * @returns {import('./types.js').Binding<Data>}
 */
export function repeat(selector, project, keyOrBindings, bindings) {
  if (
    keyOrBindings !== undefined
    && typeof keyOrBindings !== 'function'
    && !Array.isArray(keyOrBindings)
  ) {
    throw new TypeError(
      'Lumi repeat third argument must be a key projection or binding list',
    )
  }

  const key = typeof keyOrBindings === 'function'
    ? keyOrBindings
    : undefined
  const localBindings = Array.isArray(keyOrBindings)
    ? keyOrBindings
    : bindings

  return createDomBinding({
    kind: 'repeat',
    selector,
    project: /** @type {(context: import('./types.js').ProjectionContext<Parent, Data>, el: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    ...(key === undefined ? {} : {key}),
    bindings: repeatBindingDescriptors(localBindings),
  })
}

/**
 * @template Data
 * @param {ReadonlyArray<import('./types.js').Binding<Data>> | undefined} bindings
 * @returns {ReadonlyArray<import('./plan.js').DomBindingDescriptor<Data>>}
 */
function repeatBindingDescriptors(bindings) {
  if (bindings === undefined) {
    return []
  }

  return bindings.map(binding => {
    const descriptor = getDomBindingDescriptor(binding)

    if (descriptor === null) {
      throw new TypeError(
        'Lumi repeat bindings must use built-in DOM bindings',
      )
    }

    return descriptor
  })
}

/**
 * Projects a text-compatible scalar into textContent for each occurrence.
 * A nullish or non-text result leaves the existing text unchanged.
 *
 * @template Item
 * @template [Data=unknown]
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {ContextProjection<Item, Data, TextValue | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function text(selector, project) {
  return createDomBinding({
    kind: 'text',
    selector,
    project: /** @type {(context: import('./types.js').ProjectionContext<Item, Data>, el: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
  })
}

/**
 * Projects data into a native DOM property and reconciles against its live
 * value on every render. A nullish projection performs no DOM operation.
 *
 * Native event handlers and srcdoc are not supported by generic bindings.
 * innerHTML and outerHTML projections must return a genuine TrustedHTML value
 * created by a policy in a browser that implements the Trusted Types API.
 *
 * @template Item
 * @template [Data=unknown]
 * @template [Value=unknown]
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {ContextProjection<Item, Data, Value | null | undefined, SelectorElement<Selector>>} project
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
    project: /** @type {(context: import('./types.js').ProjectionContext<Item, Data>, el: Element) => unknown} */ (
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
 * @template Item
 * @template [Data=unknown]
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {string} name
 * @param {ContextProjection<Item, Data, TextValue | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {TypeError} When name is an event handler or srcdoc.
 */
export function attr(selector, name, project) {
  assertSafeBindingName('attribute', name)

  return createDomBinding({
    kind: 'attribute',
    selector,
    project: /** @type {(context: import('./types.js').ProjectionContext<Item, Data>, el: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    name,
  })
}

/**
 * Toggles one class without replacing classes owned by HTML or other code. A
 * nullish projection performs no DOM operation.
 *
 * @template Item
 * @template [Data=unknown]
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {string} name
 * @param {ContextProjection<Item, Data, boolean | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function classToggle(selector, name, project) {
  return createDomBinding({
    kind: 'class',
    selector,
    project: /** @type {(context: import('./types.js').ProjectionContext<Item, Data>, el: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    name,
  })
}

/**
 * Projects data into one inline style property without replacing the style
 * attribute. A nullish projection performs no DOM operation.
 *
 * @template Item
 * @template [Data=unknown]
 * @template {string} [Selector=string]
 * @param {Selector} selector
 * @param {string} name
 * @param {ContextProjection<Item, Data, string | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function style(selector, name, project) {
  return createDomBinding({
    kind: 'style',
    selector,
    project: /** @type {(context: import('./types.js').ProjectionContext<Item, Data>, el: Element) => unknown} */ (
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
