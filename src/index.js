// @ts-check

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
 * @typedef {import('./types.js').MountedComponent<Data>} MountedComponent
 */

/**
 * @typedef {import('./types.js').EventBindingLocation} EventBindingLocation
 */

/**
 * @typedef {import('./types.js').EventBindingFrequency} EventBindingFrequency
 */

/**
 * @typedef {import('./types.js').EventBindingOptions} EventBindingOptions
 */

/**
 * @template Item
 * @template [Data=unknown]
 * @typedef {import('./types.js').ProjectionContext<Item, Data>} ProjectionContext
 */

export {
  attr,
  child,
  classToggle,
  prop,
  repeat,
  style,
  text,
} from './bindings.js'
export { component } from './component.js'
export { on } from './events.js'
