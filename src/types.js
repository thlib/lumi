/**
 * Work prepared from one data snapshot without mutating the live DOM.
 *
 * @internal
 * @typedef {object} PreparedUpdate
 * @property {() => void} commit
 * @property {() => void} [discard]
 */

/**
 * @internal
 * @template Data
 * @typedef {object} ConnectedBinding
 * @property {(data: Data) => PreparedUpdate} prepare
 * @property {() => void} destroy
 */

/**
 * A Binding owns one declared relationship between data and DOM state.
 *
 * @internal
 * @template Data
 * @typedef {object} Binding
 * @property {(root: Element) => ConnectedBinding<Data>} connect
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
 * Where Lumi registers an event binding.
 *
 * "component" routes matching events through component-owned event
 * boundaries. "elements" maintains native listeners on every matching
 * Lumi-owned element.
 *
 * @typedef {'component' | 'elements'} EventBindingLocation
 */

/**
 * How often one event binding declaration may invoke its handler.
 *
 * "always" keeps the binding active for the lifetime of the mounted
 * component. "once" allows the declaration to invoke its handler at most once
 * during that lifetime, regardless of how many elements match.
 *
 * @typedef {'always' | 'once'} EventBindingFrequency
 */

/**
 * @typedef {Readonly<{
 *   at?: EventBindingLocation,
 *   capture?: boolean,
 *   passive?: boolean,
 *   freq?: EventBindingFrequency,
 * }>} EventBindingOptions
 */

/**
 * @template Data
 * @typedef {object} ComponentOptions
 * @property {HTMLTemplateElement | null} template
 * @property {ReadonlyArray<Binding<Data>>} [bindings]
 */

/**
 * A Component can create a new DOM instance.
 *
 * @template Data
 * @typedef {object} Component
 * @property {(target: Element | null) => MountedComponent<Data>} mount
 */

/**
 * @template Data
 * @typedef {object} MountedComponent
 * @property {Element} root
 * @property {(data: Data) => void} update
 * @property {() => void} unmount
 */

export {}
