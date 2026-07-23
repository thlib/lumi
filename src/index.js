// @ts-check

/**
 * @template Data
 * @typedef {import('./types.js').Binding<Data>} Binding
 */

/**
 * @template Data
 * @typedef {import('./types.js').Component<Data>} Component
 */

/**
 * @template Data
 * @typedef {import('./types.js').ComponentOptions<Data>} ComponentOptions
 */

/**
 * @template Data
 * @typedef {import('./types.js').EventContext<Data>} EventContext
 */

/**
 * @template Data
 * @typedef {import('./types.js').MountedComponent<Data>} MountedComponent
 */

export {
  attribute,
  child,
  classToggle,
  on,
  property,
  repeat,
  style,
  text,
} from './bindings.js'
export { component } from './component.js'
