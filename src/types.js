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
