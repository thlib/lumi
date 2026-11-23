// @ts-check

import {definitions} from './internal/definitions.js'
import {warn} from './internal/diagnostics.js'
import {DEV} from './internal/dev.js'
import {fail} from './internal/fail.js'
import {
  createDomBinding,
  getDomBindingDescriptor,
  markupOperations,
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
    fail(1, kind, name)
  }

  if (normalizedName === 'srcdoc') {
    fail(2, kind, name)
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
    DEV
    && keyOrBindings !== undefined
    && typeof keyOrBindings !== 'function'
    && !Array.isArray(keyOrBindings)
  ) {
    warn(
      `repeat "${selector}": the third argument is not a key projection or `
      + 'a list of bindings. It has no effect.',
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
    key,
    bindings: (localBindings ?? []).map(binding => {
      const descriptor = getDomBindingDescriptor(binding)

      if (DEV && descriptor === null) {
        fail(23, selector)
      }

      return /** @type {import('./plan.js').DomBindingDescriptor<Data>} */ (
        descriptor
      )
    }),
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
 * @param {string} name
 * @param {ContextProjection<Item, Data, Value | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {Error} E1 or E2 when name is an event handler or srcdoc. An
 * innerHTML or outerHTML projection that does not return TrustedHTML gives
 * E3 or E4 in the update.
 */
export function prop(selector, name, project) {
  assertSafeBindingName('property', name)

  return createDomBinding({
    kind: 'property',
    markup: markupOperations,
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
 * ARIA states are string tokens. For a literal `aria-*` name, the projection
 * cannot return `true`, because `true` writes an empty attribute. Project
 * `'true'` or `'false'` instead.
 *
 * Native event handlers and srcdoc are not supported by generic bindings.
 *
 * @template Item
 * @template [Data=unknown]
 * @template {string} [Selector=string]
 * @template {string} [Name=string]
 * @param {Selector} selector
 * @param {Name} name
 * @param {ContextProjection<Item, Data, (Lowercase<Name> extends `aria-${string}` ? string | number | false : TextValue) | null | undefined, SelectorElement<Selector>>} project
 * @returns {import('./types.js').Binding<Data>}
 * @throws {Error} E1 or E2 when name is an event handler or srcdoc.
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
 * Puts one nested component into each selected container and projects
 * parent data into it.
 *
 * The container owns the root of the child component. The child replaces
 * the content of the container. A selector that matches no element puts in
 * no child. A nullish projection keeps the child as it is.
 *
 * In the binding list of a `repeat`, each occurrence gets its own child, and
 * the projection receives the context of that occurrence.
 *
 * @template Item
 * @template Data
 * @template ChildData
 * @param {string} selector
 * @param {import('./types.js').Component<ChildData>} childComponent
 * @param {ContextProjection<Item, Data, ChildData | null | undefined>} project
 * @returns {import('./types.js').Binding<Data>}
 */
export function child(selector, childComponent, project) {
  if (DEV && !definitions.has(childComponent)) {
    fail(24)
  }

  return createDomBinding({
    kind: 'child',
    selector,
    project: /** @type {(context: import('./types.js').ProjectionContext<Item, Data>, el: Element) => unknown} */ (
      /** @type {unknown} */ (project)
    ),
    component: childComponent,
  })
}
