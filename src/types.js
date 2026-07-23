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
 * @property {(root: Element) => ConnectedBinding<Data>} connect
 */

/**
 * @template Data
 * @typedef {object} ComponentOptions
 * @property {HTMLTemplateElement | null} template
 * @property {ReadonlyArray<Binding<Data>>} [bindings]
 */

/**
 * @template Data
 * @typedef {object} MountOptions
 * @property {Element | null} target
 * @property {HTMLTemplateElement | null} template
 * @property {ReadonlyArray<Binding<Data>>} [bindings]
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

export {}
