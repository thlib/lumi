import type {Component, ComponentOptions} from './lumi.js'

/**
 * Lists the bindings of a component whose selector matches no element in
 * the component source, in the order of their declaration.
 *
 * A selector that matches no element is a no-op in Lumi. Use this function
 * in a test to find a selector with a typing mistake. The function needs no
 * data, because each selector resolves one time, in the component source.
 *
 * @param component A component from `component()`, or its options.
 */
export function unmatchedSelectors(
  component: Component<any> | ComponentOptions<any>,
): Array<{
  binding:
    | 'repeat'
    | 'child'
    | 'text'
    | 'prop'
    | 'attr'
    | 'classToggle'
    | 'style'
    | 'on'
  selector: string
}>
