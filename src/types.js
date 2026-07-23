/**
 * @template Data
 * @typedef {object} BindingContext
 * @property {() => Data} data Returns the latest successfully rendered data.
 * @property {(data: Data) => void} render Renders another explicit snapshot.
 */

/**
 * @template Data
 * @typedef {object} ConnectedBinding
 * @property {(data: Data) => void} render
 * @property {() => void} destroy
 */

/**
 * A Binding owns one declared relationship between data and DOM state.
 *
 * @template Data
 * @typedef {object} Binding
 * @property {(root: Element, context: BindingContext<Data>) => ConnectedBinding<Data>} connect
 */

/**
 * @template Data
 * @typedef {object} ComponentOptions
 * @property {HTMLTemplateElement | null} template
 * @property {ReadonlyArray<Binding<Data>>} [bindings]
 * @property {ReadonlyArray<Binding<Data>>} [events]
 */

/**
 * @template Data
 * @typedef {object} MountOptions
 * @property {Element | null} target
 * @property {HTMLTemplateElement | null} template
 * @property {ReadonlyArray<Binding<Data>>} [bindings]
 * @property {ReadonlyArray<Binding<Data>>} [events]
 */

/**
 * A Component can create a new DOM instance or take ownership of an existing
 * root element.
 *
 * @template Data
 * @typedef {object} Component
 * @property {(target: Element | null) => MountedComponent<Data>} mount
 * @property {(root: Element) => MountedComponent<Data>} adopt
 */

/**
 * @template Data
 * @typedef {object} MountedComponent
 * @property {Element} root
 * @property {(data: Data) => void} render
 * @property {() => void} unmount
 */

/**
 * @template Data
 * @typedef {object} EventContext
 * @property {Data} data
 * @property {Element} element
 * @property {Event} event
 * @property {(data: Data) => void} render
 * @property {Element} root
 */

export {}
