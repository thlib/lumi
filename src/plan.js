// @ts-check

/**
 * The package-internal DOM planner and its sinks. The supported package
 * surface is exported only from index.js.
 *
 * Each selector resolves one time, when a component mounts. An update
 * prepares one value for each target and then commits the values. Only the
 * elements that a markup write creates get their selector matches in each
 * update.
 *
 * @internal
 */

import {
  createLocator,
  elementAtPath,
  elementPath,
  locateElements,
  markCreated,
  queryOwnedElements,
  tasksByDepth,
} from './dom.js'
import {
  duplicateKey,
  matchIntegerKeys,
  stableOccurrences,
} from './keyed.js'
import {warn} from './internal/diagnostics.js'
import { noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {itemContext, rootContext} from './internal/projection-context.js'
import { isStructuralBinding } from './internal/structural.js'

const domBindingDescriptor = Symbol('Lumi DOM binding descriptor')
/**
 * The key of the containers that a connected binding owns. The DOM inside
 * an owned container belongs to a nested component.
 */
export const ownedDomSubtrees = Symbol('Lumi owned DOM subtrees')
const classWhitespace = '[\\t\\n\\f\\r ]'
const textValues = 'a string, number, or boolean'
// The cache of a binding that never caches a value.
/** @type {WeakMap<Element, CachedValue>} */
const unusedValues = new WeakMap()

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * The Trusted Types capability Lumi needs to authenticate TrustedHTML.
 * Some TypeScript DOM libraries do not yet declare this browser API.
 *
 * @typedef {(value: unknown) => boolean} TrustedHTMLCheck
 */

/**
 * @typedef {'repeat' | 'text' | 'property' | 'attribute' | 'class' | 'style'} DomBindingKind
 */

/**
 * @template Data
 * @typedef {object} DomBindingDescriptor
 * @property {DomBindingKind} kind
 * @property {string} selector
 * @property {(input: any, el: Element) => unknown} project
 * @property {((input: any) => unknown) | undefined} [key]
 * @property {string} [name]
 * @property {DomBindingDescriptor<Data>} [scope]
 * @property {ReadonlyArray<DomBindingDescriptor<Data>>} [bindings]
 */

/**
 * @typedef {object} CachedValue
 * @property {unknown} projectedValue
 * @property {unknown} domValue
 */

/**
 * @template Data
 * @typedef {object} DomBindingRuntime
 * @property {DomBindingDescriptor<Data>} descriptor
 * @property {number} index
 * @property {boolean} structural Whether the binding replaces the complete
 * contents of its element.
 * @property {DomBindingRuntime<Data> | undefined} [scope] The repeat
 * declaration that owns this declaration. The planner sets it.
 * @property {WeakMap<Element, CachedValue>} values The last value that a
 * property binding gave to each element. Other bindings do not use it.
 * @property {boolean} requiresTrustedHTML
 * @property {Set<string> | null} warnings The categories of the warnings
 * that the declaration has reported.
 * @property {Window | null} view
 * @property {(projected: unknown) => unknown} normalize
 * @property {(element: Element, value: unknown) => Element | void} apply
 * Writes a value. A property binding gives the element that has the value.
 */

/**
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @returns {import('./types.js').Binding<Data>}
 */
export function createDomBinding(descriptor) {
  const binding = {
    [domBindingDescriptor]: descriptor,

    connect(/** @type {Element} */ root) {
      return connectDomBindings(root, flattenDomBindingDescriptors([descriptor]))
    },
  }

  return /** @type {import('./types.js').Binding<Data>} */ (binding)
}

/**
 * Returns Lumi's internal descriptor for a built-in DOM binding.
 *
 * @template Data
 * @param {import('./types.js').Binding<Data>} binding
 * @returns {DomBindingDescriptor<Data> | null}
 */
export function getDomBindingDescriptor(binding) {
  return /** @type {any} */ (binding)?.[domBindingDescriptor] ?? null
}

/**
 * Returns one built-in DOM declaration and every nested declaration owned by
 * an optional repeat binding list. Nested declarations retain their owning
 * repeat so the planner can resolve their selectors locally.
 *
 * @template Data
 * @param {ReadonlyArray<DomBindingDescriptor<Data>>} descriptors
 * @param {DomBindingDescriptor<Data> | undefined} [scope]
 * @param {Array<DomBindingDescriptor<Data>>} [flattened]
 * @returns {ReadonlyArray<DomBindingDescriptor<Data>>}
 */
export function flattenDomBindingDescriptors(
  descriptors,
  scope = undefined,
  flattened = [],
) {
  for (const descriptor of descriptors) {
    const declaration = scope === undefined
      ? descriptor
      : {...descriptor, scope}

    flattened.push(declaration)

    if (descriptor.bindings !== undefined) {
      flattenDomBindingDescriptors(
        descriptor.bindings,
        declaration,
        flattened,
      )
    }
  }

  return flattened
}

/**
 * Connects all built-in DOM declarations of one component to the planner.
 *
 * Each selector resolves one time, in the component source. A repeat makes
 * its occurrences from the source, and a markup write is planned in a copy
 * of the source, so these declarations need an inert copy. All other
 * components resolve their selectors in the mounted root.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingDescriptor<Data>>} descriptors
 * @param {ReadonlyArray<Element>} [ownedSubtrees]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function connectDomBindings(root, descriptors, ownedSubtrees = []) {
  const trustedTypes = descriptors.some(writesMarkup)
    ? trustedTypesFactory(root)
    : null
  const runtimes = descriptors.map((descriptor, index) => {
    return createDomBindingRuntime(descriptor, index, root, trustedTypes)
  })
  const needsCopy = descriptors.some(descriptor => {
    return descriptor.kind === 'repeat' || writesMarkup(descriptor)
  })

  return connectPlanner(
    root,
    // Import into a document without a browsing context or custom-element
    // registry. Unlike cloneNode() in the live document, this cannot invoke
    // custom-element constructors.
    needsCopy
      ? /** @type {Element} */ (
        root.ownerDocument.implementation.createHTMLDocument()
          .importNode(root, true)
      )
      : root,
    runtimes,
    ownedSubtrees.map(subtree => elementPath(root, subtree)),
  )
}

/**
 * Tells whether a declaration writes markup. Markup must be TrustedHTML. A
 * markup write can create elements that the selectors match, so the
 * selectors resolve again after such a write.
 *
 * @param {{kind: string, name?: string}} descriptor
 */
function writesMarkup(descriptor) {
  return descriptor.kind === 'property'
    && (descriptor.name === 'innerHTML' || descriptor.name === 'outerHTML')
}

/**
 * Compiles binding-kind-specific normalization and application once when a
 * component connects, keeping the per-element update loop monomorphic.
 *
 * `normalize` gives the value to write for a projected value, or `noValue`
 * when the projected value asks for no DOM operation.
 *
 * `apply` writes a value when the DOM does not have it.
 *
 * @template Data
 * @param {DomBindingDescriptor<Data>} descriptor
 * @param {number} index
 * @param {Element} root
 * @param {TrustedHTMLCheck | null} trustedTypes
 * @returns {DomBindingRuntime<Data>}
 */
function createDomBindingRuntime(descriptor, index, root, trustedTypes) {
  const kind = descriptor.kind
  const name = /** @type {string} */ (descriptor.name)
  /** @type {DomBindingRuntime<Data>} */
  const runtime = {
    descriptor,
    index,
    structural: isStructuralBinding(descriptor),
    values: kind === 'property' ? new WeakMap() : unusedValues,
    requiresTrustedHTML: writesMarkup(descriptor),
    warnings: null,
    view: root.ownerDocument.defaultView,
    normalize: projected => projected ?? noValue,
    apply: () => {},
  }

  /**
   * Sets `apply` for a binding whose current DOM value can be read and
   * compared with the normalized value.
   *
   * @param {(element: Element) => unknown} read
   * @param {(element: Element, value: any) => void} write
   */
  const useDomValue = (read, write) => {
    runtime.apply = (element, value) => {
      if (read(element) !== value) {
        write(element, value)
      }
    }
  }

  switch (kind) {
    case 'repeat':
      runtime.normalize = projected => {
        if (!Array.isArray(projected)) {
          return ignore(runtime, projected, 'an array')
        }

        for (let i = 0; i < projected.length; i += 1) {
          if (!Object.hasOwn(projected, i)) {
            return ignore(runtime, projected, 'a dense array', 'sparse array')
          }
        }
        return projected
      }
      break
    case 'text':
      runtime.normalize = projected => normalizeText(runtime, projected)
      runtime.apply = applyText
      break
    case 'property': {
      // An outerHTML write replaces its element. The binding then owns
      // the element that took the place of its target.
      /** @type {WeakMap<Element, Element> | null} */
      const replacements = name === 'outerHTML' ? new WeakMap() : null

      if (runtime.requiresTrustedHTML) {
        runtime.normalize = projected => {
          if (projected === null || projected === undefined) {
            return noValue
          }

          if (trustedTypes === null) {
            throw new TypeError(
              `Lumi property "${name}" requires TrustedHTML, but the `
              + 'mounted document does not expose the Trusted Types API',
            )
          }

          if (!trustedTypes(projected)) {
            throw new TypeError(
              `Lumi property "${name}" projection must return TrustedHTML; `
              + `received ${projectionValueType(projected)}`,
            )
          }

          return projected
        }
      }
      runtime.apply = (target, value) => {
        let element = replacements?.get(target) ?? target
        const projectedValue = runtime.requiresTrustedHTML
          ? String(value)
          : value
        const previous = runtime.values.get(element)

        // The property is current when it holds the projected value, or
        // the value that the browser kept after the last write.
        const current = /** @type {any} */ (element)[name]

        if (
          !Object.is(current, projectedValue)
          && (
            previous === undefined
            || !Object.is(previous.projectedValue, projectedValue)
            || !Object.is(previous.domValue, current)
          )
        ) {
          const before = element.previousSibling
          const after = element.nextSibling
          const parent = element.parentNode

          if (!Reflect.set(element, name, value)) {
            throw new TypeError(
              `Lumi could not set property "${name}" on <${element.localName}>`,
            )
          }

          if (runtime.structural) {
            /** @type {TextSink} */ (element)[writtenText] = undefined
          }

          if (replacements !== null && parent !== null) {
            const first = before === null
              ? parent.firstChild
              : before.nextSibling

            // Markup with more or fewer than one element leaves no element
            // for the binding.
            if (
              first !== null
              && first.nodeType === 1
              && first.nextSibling === after
            ) {
              element = /** @type {Element} */ (first)
              replacements.set(target, element)
            }
          }
        }

        runtime.values.set(element, {
          projectedValue,
          domValue: /** @type {any} */ (element)[name],
        })

        return element
      }
      break
    }
    case 'attribute': {
      // Decided once per declaration so the update path pays one boolean test.
      const isAria = /^aria-/i.test(name)
      runtime.normalize = projected => {
        if (!isTextValue(projected)) {
          return ignore(runtime, projected, textValues)
        }

        if (isAria && projected === true) {
          warnOnce(
            runtime,
            'ARIA boolean true',
            `projected true into "${name}"; true writes an empty attribute, `
            + 'but ARIA states are string tokens. Project the string \'true\' '
            + 'or \'false\' instead, for example String(value).',
          )
        }
        return projected === false
          ? false
          : projected === true
            ? ''
            : String(projected)
      }
      useDomValue(
        // The attribute value, or false when the attribute is absent.
        element => element.getAttribute(name) ?? false,
        (element, value) => {
          if (value === false) {
            element.removeAttribute(name)
          } else {
            element.setAttribute(name, value)
          }
        },
      )
      break
    }
    case 'class': {
      runtime.normalize = projected => {
        return typeof projected === 'boolean'
          ? projected
          : ignore(runtime, projected, 'a boolean')
      }

      // Keep native DOMTokenList errors for invalid tokens. Valid fixed
      // tokens use the raw attribute so an update does not create and
      // search a DOMTokenList for all classes on the element.
      if (name === '' || /[\t\n\f\r ]/.test(name)) {
        useDomValue(
          element => element.classList.contains(name),
          (element, value) => element.classList.toggle(name, value),
        )
        break
      }

      const occurrence = new RegExp(
        `(^|${classWhitespace})`
        + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        + `(?=$|${classWhitespace})`,
        'g',
      )
      useDomValue(
        element => (element.getAttribute('class') ?? '').search(occurrence) >= 0,
        (element, value) => {
          const current = element.getAttribute('class') ?? ''
          element.setAttribute(
            'class',
            !value
              ? current.replace(occurrence, '$1')
              : current === '' || /[\t\n\f\r ]$/.test(current)
                ? current + name
                : `${current} ${name}`,
          )
        },
      )
      break
    }
    case 'style': {
      runtime.normalize = projected => {
        return typeof projected === 'string'
          ? projected
          : ignore(runtime, projected, 'a string')
      }

      // The CSSStyleDeclaration property for a standard CSS property name.
      // Custom properties and non-standard spellings use the CSSOM methods.
      const property = name.startsWith('--') || /[A-Z]/.test(name)
        ? null
        : name === 'float'
          ? 'cssFloat'
          : name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

      /**
       * @param {Element} element
       * @returns {Record<string, unknown> & CSSStyleDeclaration}
       */
      const styleOf = element => {
        if (!('style' in element)) {
          throw new TypeError(
            'Lumi style binding requires a styled element, '
            + `received <${element.localName}>`,
          )
        }

        return /** @type {Record<string, unknown> & CSSStyleDeclaration} */ (
          element.style
        )
      }

      useDomValue(
        element => {
          const style = styleOf(element)
          return property !== null && typeof style[property] === 'string'
            ? style[property]
            : style.getPropertyValue(name)
        },
        (element, value) => {
          const style = styleOf(element)

          if (property !== null && typeof style[property] === 'string') {
            style[property] = value
          } else {
            // An empty value removes the property.
            style.setProperty(name, value)
          }
        },
      )
      break
    }
  }

  return runtime
}

/**
 * The key of the text that a `text` binding last gave to an element. A `text`
 * binding compares its projection with this value and does not read the live
 * DOM. The element holds the value, not the binding, so overlapping
 * declarations for one element see the writes of each other and the last
 * declaration wins. A symbol property on the element is faster than a
 * `WeakMap`, most of all when an update creates many elements.
 */
const writtenText = Symbol('lumi.text')

/** @typedef {Element & {[writtenText]?: string | undefined}} TextSink */

/**
 * Gives the text to write for the projected value of a `text` binding, or
 * `noValue` for a value that is not text.
 *
 * @param {{descriptor: {kind: string, selector: string}}} runtime
 * @param {unknown} projected
 * @returns {string | typeof noValue}
 */
function normalizeText(runtime, projected) {
  return typeof projected === 'string'
    ? projected
    : isTextValue(projected)
      ? String(projected)
      : ignore(/** @type {DomBindingRuntime<any>} */ (runtime), projected, textValues)
}

/**
 * Writes the value of a `text` binding. All text bindings use this one
 * function, so the call that writes a value sees few different functions.
 *
 * @param {Element} element
 * @param {unknown} value
 */
function applyText(element, value) {
  const text = /** @type {string} */ (value)
  const sink = /** @type {TextSink} */ (element)
  const written = sink[writtenText]

  if (written === text) {
    return
  }

  sink[writtenText] = text

  const first = element.firstChild
  // The text node, when the element has only that node.
  const only = first !== null
    && first.nodeType === 3
    && first.nextSibling === null
    ? /** @type {Text} */ (first)
    : null

  // Without a remembered value, the element has its source content.
  // One read keeps the first update free of a redundant write. An
  // element without a child node, or with one text node, gives its
  // text without the `textContent` of the element.
  if (
    written === undefined
    && (
      first === null
        ? ''
        : only !== null
          ? only.data
          : element.textContent
    ) === text
  ) {
    return
  }

  // Keep the text node when the element has only that node. An empty
  // value removes all child nodes, as `textContent` does.
  if (text !== '' && only !== null) {
    only.data = text
  } else {
    element.textContent = text
  }
}

/**
 * Gets the policy factory from the mounted component's realm. Detached
 * planning documents have no Window, so the live root is the authoritative
 * realm for authenticating values used during both planning and commit.
 *
 * @param {Element} root
 * @returns {TrustedHTMLCheck | null}
 */
function trustedTypesFactory(root) {
  const factory = /** @type {any} */ (root.ownerDocument.defaultView)
    ?.trustedTypes
  const isHTML = factory?.isHTML

  return typeof isHTML === 'function'
    ? value => isHTML.call(factory, value) === true
    : null
}

/**
 * Describes a rejected projection value without coercing it.
 *
 * @param {unknown} value
 * @returns {string}
 */
function projectionValueType(value) {
  return Array.isArray(value) ? 'an array' : `type ${typeof value}`
}

/**
 * Gives `noValue` for a projected value that a binding cannot write, so the
 * existing DOM state stays. A nullish value asks for that result. Each
 * other value is a recoverable mismatch, reported one time per mounted
 * declaration and received category.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {unknown} value
 * @param {string} expected
 * @param {string} [category]
 * @returns {typeof noValue}
 */
function ignore(runtime, value, expected, category) {
  if (value !== null && value !== undefined) {
    category ??= projectionValueType(value)
    warnOnce(
      runtime,
      category,
      `ignored ${category}; expected ${expected}. `
      + 'The existing DOM state was preserved.',
    )
  }

  return noValue
}

/**
 * Reports one diagnostic per mounted declaration and category.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {string} category
 * @param {string} message
 */
function warnOnce(runtime, category, message) {
  if (runtime.warnings?.has(category) === true) {
    return
  }

  runtime.warnings ??= new Set()
  runtime.warnings.add(category)
  warn(
    `Lumi ${runtime.descriptor.kind} binding `
    + `"${runtime.descriptor.selector}" ${message}`,
    runtime.view,
  )
}

/**
 * @param {unknown} value
 * @returns {value is TextValue}
 */
function isTextValue(value) {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
}

/**
 * @typedef {object} Runtime
 * @property {{
 *   kind: 'repeat' | 'text' | 'property' | 'attribute' | 'class' | 'style',
 *   selector: string,
 *   project: (input: unknown, el: Element) => unknown,
 *   key?: ((input: unknown) => unknown) | undefined,
 *   name?: string,
 *   scope?: Runtime['descriptor']
 * }} descriptor
 * @property {number} index
 * @property {Runtime | undefined} [scope] The repeat declaration that owns
 * this declaration. A declaration at the component boundary has none.
 * @property {WeakMap<Element, {
 *   projectedValue: unknown,
 *   domValue: unknown
 * }>} values
 * @property {(projected: unknown) => unknown} normalize
 * @property {(element: Element, value: unknown) => Element | void} apply
 */

/**
 * @typedef {object} SinkSpec
 * @property {Runtime} runtime
 * @property {Element} target
 * @property {number} matchIndex
 * @property {number[]} path
 */

/**
 * @typedef {object} ScopeSpec
 * @property {SinkSpec[]} sinks
 * @property {RegionSpec[]} regions
 * @property {import('./dom.js').Locator} locator Finds the sink elements,
 * then the repeat targets, below the element of the scope.
 */

/**
 * @typedef {object} RegionSpec
 * @property {Runtime} runtime
 * @property {Element} target
 * @property {number} matchIndex
 * @property {number[]} path
 * @property {SinkSpec[]} ownSinks
 * @property {ScopeSpec} scope
 * @property {ReadonlyArray<unknown> | null} acceptedKeys The keys of the
 * last item list that passed the duplicate check.
 * @property {boolean} keepsContexts Whether a plan keeps the context of each
 * occurrence. Only dynamic planning reads the contexts.
 */

/**
 * The plan of the component boundary: one prepared value for each sink
 * spec and one plan for each region spec, at the same index.
 *
 * @typedef {object} ScopePlan
 * @property {ReadonlyArray<unknown>} sinks
 * @property {ReadonlyArray<RegionPlan>} regions
 */

/**
 * The plan of all occurrences of one region. A plan holds no object for
 * each occurrence or each sink: the values of all occurrences are in one
 * array, so an update creates few objects.
 *
 * @typedef {object} RegionPlan
 * @property {RegionSpec} spec
 * @property {number} count The number of occurrences.
 * @property {ReadonlyArray<unknown> | null} keys The key of each occurrence,
 * or null for a repeat without a key projection.
 * @property {ReadonlyArray<import('./types.js').ProjectionContext<unknown, unknown>> | null} contexts
 * The context of each occurrence, when the spec keeps contexts.
 * @property {ReadonlyArray<unknown>} values The prepared values. Each
 * occurrence has the values of the own sinks, then the values of the sinks
 * in its scope.
 * @property {ReadonlyArray<RegionPlan>} regions The plans of the nested
 * regions: for each occurrence, one plan for each region in its scope.
 * @property {boolean} isNoop Whether the projection asked for no operation.
 */

/**
 * @typedef {(runtime: Runtime, element: Element, value: unknown) => void} ApplyValue
 */

/**
 * @typedef {object} DynamicOperation
 * @property {Runtime} runtime
 * @property {number} matchIndex
 * @property {number} matchCount
 * @property {unknown} value
 */

/**
 * Creates the planner of one component.
 *
 * Each selector resolves one time, in the blueprint. The plan of an update
 * holds one value for each target, and the commit writes the values to the
 * mounted elements at the same positions. Only the elements that a markup
 * write creates get their selector matches in each update.
 *
 * The renderer knows only ordinary JavaScript values. Projection syntax and
 * data lookup conventions remain application concerns.
 *
 * @param {Element} root
 * @param {Element} blueprintRoot
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 */
function connectPlanner(
  root,
  blueprintRoot,
  runtimes,
  ownedSubtreePaths,
) {
  const runtimeByDescriptor = new Map(
    runtimes.map(runtime => [runtime.descriptor, runtime]),
  )

  // A declaration in the binding list of a repeat resolves its selector in
  // the occurrences of that repeat only.
  for (const runtime of runtimes) {
    const owner = runtime.descriptor.scope

    if (owner !== undefined) {
      runtime.scope = runtimeByDescriptor.get(owner)
    }
  }

  const needsDynamicPlanning = runtimes.some(runtime => {
    return writesMarkup(runtime.descriptor)
  })
  const scope = compileScope(
    blueprintRoot,
    runtimes,
    ownedSubtreePaths.map(path => elementAtPath(blueprintRoot, path)),
    needsDynamicPlanning,
  )
  /** @type {ScopeState | null} */
  let state = null
  // The markup writes of one commit: each runtime, then its element.
  /** @type {Array<Runtime | Element>} */
  const markupWrites = []

  /**
   * Writes one prepared value and records a markup write.
   *
   * @type {ApplyValue}
   */
  const applyMarkup = (runtime, target, value) => {
    if (value !== noValue) {
      const element = runtime.apply(target, value)

      if (element !== undefined && writesMarkup(runtime.descriptor)) {
        markupWrites.push(runtime, element)
      }
    }
  }
  const apply = needsDynamicPlanning ? applyMarkup : applyLive

  return {
    prepare(/** @type {unknown} */ data) {
      const plan = prepareScope(scope, rootContext(data))
      const dynamicOperations = needsDynamicPlanning
        ? prepareDynamicOperations(
          blueprintRoot,
          scope,
          plan,
          runtimes,
          ownedSubtreePaths,
          data,
        )
        : []
      return {
        commit() {
          if (state === null) {
            state = new ScopeState(root)

            if (blueprintRoot === root) {
              // The selectors resolved in the mounted root, so the targets
              // are the mounted elements.
              state.sinks = scope.sinks.map(sink => sink.target)
            } else {
              state.connect(scope)
            }
          }

          markupWrites.length = 0
          state.apply(scope, apply, plan.sinks, 0, plan.regions, 0)

          if (needsDynamicPlanning) {
            commitDynamicOperations(
              root,
              dynamicOperations,
              ownedSubtreePaths,
              apply,
            )

            // A markup write can establish content that the rules for its
            // descendants refine. The cache gets the final content, so the
            // next update does not rebuild unchanged markup and discard
            // persistent descendant nodes.
            for (let index = 0; index < markupWrites.length; index += 2) {
              const runtime = /** @type {Runtime} */ (markupWrites[index])
              const element = /** @type {Element} */ (markupWrites[index + 1])
              const cached = runtime.values.get(element)

              if (cached !== undefined) {
                cached.domValue = /** @type {any} */ (element)[
                  /** @type {string} */ (runtime.descriptor.name)
                ]
              }
            }
          }
        },
      }
    },

    destroy() {
      state?.destroy()
      state = null
    },
  }
}

/**
 * Writes one prepared value to its element.
 *
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {unknown} value
 */
function applyLive(runtime, element, value) {
  if (value !== noValue) {
    // Text is the most frequent binding. The call through `runtime.apply`
    // sees the functions of all bindings on the page, so the engine cannot
    // inline it. This direct call stays fast.
    if (runtime.apply === applyText) {
      applyText(element, value)
    } else {
      runtime.apply(element, value)
    }
  }
}

/**
 * Compiles static template locations into nested positional regions.
 *
 * @param {Element} root
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {boolean} keepsContexts
 * @returns {ScopeSpec}
 */
function compileScope(root, runtimes, ownedSubtrees, keepsContexts) {
  /** @type {Map<Element, RegionSpec>} */
  const regionByTarget = new Map()
  /** @returns {ScopeSpec} */
  const createScope = () => {
    return { sinks: [], regions: [], locator: createLocator([]) }
  }
  const rootScope = createScope()

  for (const runtime of runtimes) {
    if (runtime.descriptor.kind !== 'repeat') {
      continue
    }

    const targets = queryRuntimeElements(root, runtime, ownedSubtrees)

    if (targets.length === 0) {
      throw new TypeError(
        `Lumi repeat selector "${runtime.descriptor.selector}" must match `
        + 'the component source',
      )
    }

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])

      if (target === root) {
        throw new TypeError(
          'Lumi cannot repeat a mounted component root',
        )
      }

      if (ownedSubtrees.some(owned => target.contains(owned))) {
        throw new Error(
          'Lumi repeat cannot replace a child subtree',
        )
      }

      // The last repeat declaration owns the number of occurrences at
      // this template location.
      regionByTarget.set(target, {
        runtime,
        target,
        matchIndex,
        path: [],
        ownSinks: [],
        scope: createScope(),
        acceptedKeys: null,
        keepsContexts,
      })
    }
  }

  // The regions of each scope are in document order.
  const regions = [...regionByTarget.values()].sort((left, right) => {
    const following = 4
    return left.target.compareDocumentPosition(right.target) & following
      ? -1
      : 1
  })

  /**
   * Finds the region whose occurrences contain a target. A declaration in
   * the binding list of a repeat must be in a region of that repeat.
   *
   * @param {Runtime} runtime
   * @param {Element} target
   * @param {boolean} strict
   */
  const parentRegion = (runtime, target, strict) => {
    const parent = nearestRegion(target, regions, strict, runtime.scope)

    if (runtime.scope !== undefined && parent === null) {
      throw new Error('Lumi repeat binding escaped its owning repeat')
    }

    return parent
  }

  for (const region of regions) {
    const parent = parentRegion(region.runtime, region.target, true)

    region.path = elementPath(parent?.target ?? root, region.target)
    ;(parent?.scope ?? rootScope).regions.push(region)
  }

  // The sinks of each scope are in declaration order.
  for (const runtime of runtimes) {
    if (runtime.descriptor.kind === 'repeat') {
      continue
    }

    const targets = queryRuntimeElements(root, runtime, ownedSubtrees)

    for (let matchIndex = 0; matchIndex < targets.length; matchIndex += 1) {
      const target = /** @type {Element} */ (targets[matchIndex])
      const parent = parentRegion(runtime, target, false)

      if (
        runtime.scope !== undefined
        && nearestRegion(target, regions, false) !== parent
      ) {
        throw new Error(
          'Lumi repeat binding crossed a repeat it does not own',
        )
      }

      if (isStructuralBinding(runtime.descriptor)) {
        if (ownedSubtrees.some(owned => target.contains(owned))) {
          throw new Error(
            'Lumi content binding cannot replace a child subtree',
          )
        }

        if (runtime.descriptor.name === 'outerHTML' && target === root) {
          throw new TypeError(
            'Lumi cannot replace a mounted component root with outerHTML',
          )
        }
      }

      const sink = {
        runtime,
        target,
        matchIndex,
        path: elementPath(parent?.target ?? root, target),
      }
      const scope = parent?.scope ?? rootScope

      if (parent !== null && sink.path.length === 0) {
        parent.ownSinks.push(sink)
        continue
      }

      // Array regions cannot safely live below another rule that replaces
      // their complete containing subtree.
      if (
        isStructuralBinding(runtime.descriptor)
        && scope.regions.some(region => target.contains(region.target))
      ) {
        throw new Error(
          'Lumi repeat cannot overlap a content-owning binding',
        )
      }

      scope.sinks.push(sink)
    }
  }

  for (const scope of [rootScope, ...regions.map(region => region.scope)]) {
    // A markup write goes before the other bindings, in ancestor order, so
    // that markup that is equal to the current content replaces no element
    // that an earlier declaration changed. The sort is stable.
    scope.sinks.sort((left, right) => markupDepth(left) - markupDepth(right))
    scope.locator = createLocator(
      [...scope.sinks, ...scope.regions].map(spec => spec.path),
    )
  }

  return rootScope
}

/**
 * @param {Element} target
 * @param {ReadonlyArray<RegionSpec>} regions
 * @param {boolean} strict
 * @param {Runtime} [runtime] The repeat declaration that must own the
 * region.
 * @returns {RegionSpec | null}
 */
function nearestRegion(target, regions, strict, runtime) {
  /** @type {RegionSpec | null} */
  let nearest = null

  for (const candidate of regions) {
    if (
      (runtime !== undefined && candidate.runtime !== runtime)
      ||
      (strict && candidate.target === target)
      || !candidate.target.contains(target)
    ) {
      continue
    }

    if (
      nearest === null
      || nearest.target.contains(candidate.target)
    ) {
      nearest = candidate
    }
  }

  return nearest
}

/**
 * The sort position of a sink: its depth for a markup write, and a position
 * after all markup writes for each other sink.
 *
 * @param {SinkSpec} sink
 */
function markupDepth(sink) {
  return writesMarkup(sink.runtime.descriptor) ? sink.path.length : 1e9
}

/**
 * @param {ScopeSpec} scope
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {ScopePlan}
 */
function prepareScope(scope, context) {
  return {
    sinks: prepareSinks(
      scope.sinks,
      context,
      new Array(scope.sinks.length),
      0,
    ),
    regions: scope.regions.map(spec => prepareRegion(spec, context)),
  }
}

/** @type {unknown[]} */
const noValues = []

/** @type {RegionPlan[]} */
const noRegionPlans = []

/**
 * Prepares one value for each sink spec, in the order of the specs, from
 * the position `offset` of `values`.
 *
 * @param {ReadonlyArray<SinkSpec>} specs
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @param {unknown[]} values
 * @param {number} offset
 * @returns {unknown[]}
 */
function prepareSinks(specs, context, values, offset) {
  for (let index = 0; index < specs.length; index += 1) {
    const spec = /** @type {SinkSpec} */ (specs[index])
    const runtime = spec.runtime
    const projected = projectValue(
      runtime,
      spec.target,
      spec.matchIndex,
      context,
    )
    // A direct call for text, as in applyLive().
    values[offset + index] = runtime.apply === applyText
      ? normalizeText(runtime, projected)
      : runtime.normalize(projected)
  }

  return values
}

/**
 * Compares two repeat keys with the equality rules of a `Map`.
 *
 * @param {unknown} left
 * @param {unknown} right
 */
function sameKey(left, right) {
  return left === right || (left !== left && right !== right)
}

/**
 * @param {RegionSpec} spec
 * @param {ReadonlyArray<unknown>} keys
 * @param {number} count The number of keys to examine
 */
function rejectDuplicateKey(spec, keys, count) {
  const index = duplicateKey(keys, count)

  if (index !== -1) {
    const firstIndex = keys.findIndex(key => sameKey(key, keys[index]))

    throw new TypeError(
      `Lumi repeat key for "${spec.runtime.descriptor.selector}" `
      + `is duplicated at item positions ${firstIndex + 1} `
      + `and ${index + 1}`,
    )
  }
}

/**
 * @param {RegionSpec} spec
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {RegionPlan}
 */
function prepareRegion(spec, context) {
  const resolved = spec.runtime.normalize(
    projectValue(spec.runtime, spec.target, spec.matchIndex, context),
  )

  if (resolved === noValue) {
    return {
      spec,
      count: 0,
      keys: null,
      contexts: null,
      values: noValues,
      regions: noRegionPlans,
      isNoop: true,
    }
  }

  const entries = /** @type {unknown[]} */ (resolved)
  const length = entries.length
  const ownSinks = spec.ownSinks
  const sinks = spec.scope.sinks
  const nested = spec.scope.regions
  const ownCount = ownSinks.length
  const valueCount = ownCount + sinks.length
  const nestedCount = nested.length
  // An empty array is never written, so all plans can share one.
  /** @type {unknown[]} */
  const values = valueCount * length === 0
    ? noValues
    : new Array(valueCount * length)
  /** @type {RegionPlan[]} */
  const regions = nestedCount * length === 0
    ? noRegionPlans
    : new Array(nestedCount * length)
  const contexts = spec.keepsContexts ? new Array(length) : null
  const project = spec.runtime.descriptor.key
  // Keys that are equal to the accepted keys, position for position, are
  // unique. The key list starts at the first key that is different, so an
  // update with the same keys builds no list and makes no check.
  const acceptedKeys = spec.acceptedKeys
  /** @type {unknown[] | null} */
  let keys = null
  // The number of keys in the list.
  let keyCount = 0

  try {
    for (let index = 0; index < length; index += 1) {
      const occurrenceContext = itemContext(context, entries[index], index)

      if (contexts !== null) {
        contexts[index] = occurrenceContext
      }

      if (project !== undefined) {
        // The key projection does not get an occurrence element, because
        // reconciliation has not selected the element.
        let key

        try {
          key = project(occurrenceContext)
        } catch (error) {
          throw projectionError(
            spec.runtime.descriptor,
            spec.matchIndex,
            error,
            index,
          )
        }

        if (
          keys === null
          && (
            acceptedKeys === null
            || index >= acceptedKeys.length
            || !sameKey(acceptedKeys[index], key)
          )
        ) {
          keys = new Array(length)

          for (let earlier = 0; earlier < index; earlier += 1) {
            keys[earlier] = /** @type {ReadonlyArray<unknown>} */ (
              acceptedKeys
            )[earlier]
          }
        }

        if (keys !== null) {
          keys[index] = key
          keyCount = index + 1
        }
      }

      const offset = index * valueCount
      prepareSinks(ownSinks, occurrenceContext, values, offset)
      prepareSinks(sinks, occurrenceContext, values, offset + ownCount)

      for (let region = 0; region < nestedCount; region += 1) {
        regions[index * nestedCount + region] = prepareRegion(
          /** @type {RegionSpec} */ (nested[region]),
          occurrenceContext,
        )
      }
    }
  } catch (error) {
    // One check of all keys comes after the projections. A duplicate key
    // comes before a projection that failed later, so its error has priority.
    if (keys !== null) {
      rejectDuplicateKey(spec, keys, keyCount)
    }
    throw error
  }

  if (keys !== null) {
    rejectDuplicateKey(spec, keys, keyCount)
  }

  /** @type {ReadonlyArray<unknown> | null} */
  let planKeys = null

  if (project !== undefined) {
    // Without a different key, the accepted array itself is the key list.
    // The commit sees the same array again and compares no keys.
    planKeys = spec.acceptedKeys = keys
      ?? (
        acceptedKeys === null || acceptedKeys.length === length
          ? acceptedKeys ?? []
          : acceptedKeys.slice(0, length)
      )
  }

  return {
    spec,
    count: length,
    keys: planKeys,
    contexts,
    values,
    regions,
    isNoop: false,
  }
}

/**
 * Evaluates one projection with its repeat context.
 *
 * @param {Runtime} runtime
 * @param {Element} element
 * @param {number} matchIndex
 * @param {import('./types.js').ProjectionContext<unknown, unknown>} context
 * @returns {unknown}
 */
function projectValue(runtime, element, matchIndex, context) {
  try {
    return runtime.descriptor.project(context, element)
  } catch (error) {
    throw projectionError(runtime.descriptor, matchIndex, error)
  }
}

/**
 * Markup writes are uncommon. When a component has one, this applies the
 * plan of the static scope to an inert copy of the source, then finds the
 * selector matches that the static scope does not own. A component without
 * a markup write does not do this work.
 *
 * @param {Element} blueprintRoot
 * @param {ScopeSpec} scope
 * @param {ScopePlan} plan
 * @param {ReadonlyArray<Runtime>} runtimes
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 * @param {unknown} data
 * @returns {DynamicOperation[]}
 */
function prepareDynamicOperations(
  blueprintRoot,
  scope,
  plan,
  runtimes,
  ownedSubtreePaths,
  data,
) {
  const planningRoot = /** @type {Element} */ (
    blueprintRoot.ownerDocument.importNode(blueprintRoot, true)
  )
  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtPath(planningRoot, path)
  })
  // The targets that each declaration has planned.
  /** @type {Map<Runtime, WeakSet<Element>>} */
  const handledByRuntime = new Map(
    runtimes.map(runtime => [runtime, new WeakSet()]),
  )
  /** @type {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} */
  const contextByElement = new WeakMap()
  /** @type {WeakMap<Element, ReadonlySet<number>>} */
  const createdBy = new WeakMap()
  /** @type {DynamicOperation[]} */
  const operations = []

  contextByElement.set(planningRoot, rootContext(data))

  /**
   * Applies one value to the copy. A markup write marks the elements
   * that it creates, so that the declaration cannot select its own output.
   *
   * @param {Runtime} runtime
   * @param {Element} element
   * @param {unknown} value
   */
  const applyPlanned = (runtime, element, value) => {
    handledByRuntime.get(runtime)?.add(element)

    if (value !== noValue) {
      const before = element.previousSibling
      const after = element.nextSibling
      const parent = element.parentNode

      runtime.apply(element, value)

      if (writesMarkup(runtime.descriptor)) {
        const history = new Set(createdBy.get(element)).add(runtime.index)

        // An outerHTML write replaces the element. The created elements
        // are between its two siblings.
        if (runtime.descriptor.name === 'innerHTML') {
          markCreated(element.firstChild, null, createdBy, history)
        } else if (parent !== null) {
          markCreated(
            before === null ? parent.firstChild : before.nextSibling,
            after,
            createdBy,
            history,
          )
        }
      }
    }
  }

  const planningState = new ScopeState(planningRoot)
  planningState.connect(scope)
  planningState.apply(scope, applyPlanned, plan.sinks, 0, plan.regions, 0)
  trackOccurrences(
    planningState.regions,
    plan.regions,
    0,
    handledByRuntime,
    contextByElement,
  )

  /** @param {Runtime} runtime */
  const matchesOf = runtime => {
    return queryRuntimeElements(planningRoot, runtime, ownedSubtrees)
  }

  /**
   * Prepares the value for one target that the static scope does not own.
   *
   * @param {Runtime} runtime
   * @param {Element} element
   * @param {number} matchIndex
   * @param {number} matchCount
   */
  const prepare = (runtime, element, matchIndex, matchCount) => {
    const projected = projectValue(
      runtime,
      element,
      matchIndex,
      findContext(element, contextByElement),
    )

    if (
      runtime.descriptor.kind === 'property'
      && runtime.descriptor.name === 'outerHTML'
    ) {
      throw new TypeError(
        'Lumi outerHTML binding targets created during array planning '
        + 'must exist in the component source',
      )
    }

    const value = runtime.normalize(projected)
    operations.push({ runtime, matchIndex, matchCount, value })
    return value
  }

  const structuralRuntimes = runtimes.filter(isStructuralRuntime)

  // Each content write can remove or create the targets of other tasks, so
  // the tasks are listed again after each write.
  while (true) {
    const task = tasksByDepth(
      planningRoot,
      structuralRuntimes,
      matchesOf,
      (runtime, element) => {
        return handledByRuntime.get(runtime)?.has(element) !== true
          && createdBy.get(element)?.has(runtime.index) !== true
      },
    )[0]

    if (task === undefined) {
      break
    }

    const { runtime, element } = task
    applyPlanned(
      runtime,
      element,
      prepare(runtime, element, task.matchIndex, task.count),
    )
  }

  for (const runtime of runtimes) {
    if (isStructuralRuntime(runtime)) {
      continue
    }

    const elements = matchesOf(runtime)
    const handled = handledByRuntime.get(runtime)

    for (let matchIndex = 0; matchIndex < elements.length; matchIndex += 1) {
      const element = /** @type {Element} */ (elements[matchIndex])

      if (handled?.has(element) !== true) {
        prepare(runtime, element, matchIndex, elements.length)
      }
    }
  }

  return operations
}

/**
 * Applies the values for the targets that the static scope does not own.
 *
 * @param {Element} root
 * @param {ReadonlyArray<DynamicOperation>} operations
 * @param {ReadonlyArray<number[]>} ownedSubtreePaths
 * @param {ApplyValue} apply
 */
function commitDynamicOperations(root, operations, ownedSubtreePaths, apply) {
  const ownedSubtrees = ownedSubtreePaths.map(path => {
    return elementAtPath(root, path)
  })

  for (const { runtime, matchIndex, matchCount, value } of operations) {
    const elements = queryRuntimeElements(root, runtime, ownedSubtrees)
    const element = elements[matchIndex]

    if (elements.length !== matchCount || element === undefined) {
      throw new Error(
        'Lumi DOM changed while committing selector '
        + `"${runtime.descriptor.selector}"`,
      )
    }

    apply(runtime, element, value)
  }
}

/**
 * @param {Runtime} runtime
 */
function isStructuralRuntime(runtime) {
  return runtime.descriptor.kind === 'repeat'
    || isStructuralBinding(runtime.descriptor)
}

/**
 * @param {Element} el
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 */
function findContext(el, contextByElement) {
  let current = /** @type {Element | null} */ (el)

  while (current !== null) {
    const context = contextByElement.get(current)

    if (context !== undefined) {
      return context
    }

    current = current.parentElement
  }

  throw new Error('Lumi lost a dynamic projection context')
}

/**
 * Records the context of each occurrence after the plan of the static scope
 * is applied to the inert copy. Only a component with a markup write does
 * this traversal.
 *
 * @param {ReadonlyArray<RegionState>} states The regions of one scope.
 * @param {ReadonlyArray<RegionPlan>} plans
 * @param {number} offset The position of the plan of the first region.
 * @param {Map<Runtime, WeakSet<Element>>} handledByRuntime
 * @param {WeakMap<Element, import('./types.js').ProjectionContext<unknown, unknown>>} contextByElement
 */
function trackOccurrences(
  states,
  plans,
  offset,
  handledByRuntime,
  contextByElement,
) {
  for (let region = 0; region < states.length; region += 1) {
    const plan = /** @type {RegionPlan} */ (plans[offset + region])
    const occurrences = /** @type {RegionState} */ (states[region]).occurrences
    const nestedCount = plan.spec.scope.regions.length

    // After the plan is applied, a region has one occurrence for each
    // planned occurrence.
    for (let index = 0; index < plan.count; index += 1) {
      const occurrence = /** @type {ScopeState} */ (occurrences[index])

      handledByRuntime.get(plan.spec.runtime)?.add(occurrence.element)
      contextByElement.set(
        occurrence.element,
        /** @type {import('./types.js').ProjectionContext<unknown, unknown>} */ (
          plan.contexts?.[index]
        ),
      )
      trackOccurrences(
        occurrence.regions,
        plan.regions,
        index * nestedCount,
        handledByRuntime,
        contextByElement,
      )
    }
  }
}

/** @type {Element[]} */
const noElements = []

/** @type {RegionState[]} */
const noRegionStates = []

/**
 * The state of one scope: the component boundary, or one occurrence of a
 * repeat. One object holds the element and its targets, so each occurrence
 * needs few objects.
 */
class ScopeState {
  /** @param {Element} element */
  constructor(element) {
    this.element = element
    // Null until the scope gets its first values.
    /** @type {Element[] | null} */
    this.sinks = null
    /** @type {RegionState[]} */
    this.regions = noRegionStates
  }

  /**
   * Finds the sink elements and the repeat targets in one walk.
   *
   * @param {ScopeSpec} spec
   */
  connect(spec) {
    const sinkCount = spec.sinks.length
    const regionCount = spec.regions.length

    if (sinkCount + regionCount === 0) {
      this.sinks = noElements
      return
    }

    /** @type {Element[]} */
    const found = new Array(sinkCount + regionCount)
    locateElements(this.element, spec.locator, found)

    if (regionCount > 0) {
      this.regions = spec.regions.map((region, index) => {
        return new RegionState(
          /** @type {Element} */ (found[sinkCount + index]),
          region,
        )
      })
      // The first occurrence of a region can go away. Do not keep it here.
      found.length = sinkCount
    }

    this.sinks = found
  }

  /**
   * Applies the values of a connected scope.
   *
   * @param {ScopeSpec} spec
   * @param {ApplyValue} apply
   * @param {ReadonlyArray<unknown>} values
   * @param {number} offset The position of the value of the first sink.
   * @param {ReadonlyArray<RegionPlan>} plans
   * @param {number} planOffset The position of the plan of the first region.
   */
  apply(spec, apply, values, offset, plans, planOffset) {
    const specs = spec.sinks
    const sinks = /** @type {Element[]} */ (this.sinks)

    for (let index = 0; index < specs.length; index += 1) {
      apply(
        /** @type {SinkSpec} */ (specs[index]).runtime,
        /** @type {Element} */ (sinks[index]),
        values[offset + index],
      )
    }

    const regions = this.regions

    for (let index = 0; index < regions.length; index += 1) {
      /** @type {RegionState} */ (regions[index]).apply(
        /** @type {RegionPlan} */ (plans[planOffset + index]),
        apply,
      )
    }
  }

  destroy() {
    for (const region of this.regions) {
      region.destroy()
    }
  }

  /** Removes an occurrence. */
  remove() {
    this.destroy()
    this.element.remove()
  }
}

class RegionState {
  /**
   * @param {Element} target
   * @param {RegionSpec} spec
   */
  constructor(target, spec) {
    this.spec = spec
    this.anchor = target.ownerDocument.createComment('lumi')
    target.after(this.anchor)
    this.occurrences = [new ScopeState(target)]
    // The key of each occurrence. Null until the first keyed plan: then the
    // one occurrence is the source element, which has no key.
    /** @type {ReadonlyArray<unknown> | null} */
    this.keys = null
  }

  /**
   * @param {RegionPlan} plan
   * @param {ApplyValue} apply
   */
  apply(plan, apply) {
    if (plan.isNoop) {
      return
    }

    if (plan.keys === null) {
      this.applyPositional(plan.count)
    } else {
      this.applyKeyed(plan.keys)
    }

    const spec = this.spec
    const scope = spec.scope
    const ownSinks = spec.ownSinks
    const ownCount = ownSinks.length
    const valueCount = ownCount + scope.sinks.length
    const nestedCount = scope.regions.length
    const occurrences = this.occurrences
    const values = plan.values

    for (let index = 0; index < plan.count; index += 1) {
      const occurrence = /** @type {ScopeState} */ (occurrences[index])
      const offset = index * valueCount

      if (occurrence.sinks === null) {
        occurrence.connect(scope)
      }

      for (let sink = 0; sink < ownCount; sink += 1) {
        apply(
          /** @type {SinkSpec} */ (ownSinks[sink]).runtime,
          occurrence.element,
          values[offset + sink],
        )
      }

      occurrence.apply(
        scope,
        apply,
        values,
        offset + ownCount,
        plan.regions,
        index * nestedCount,
      )
    }
  }

  /** @param {number} count */
  applyPositional(count) {
    const occurrences = this.occurrences

    while (occurrences.length < count) {
      occurrences.push(this.createOccurrence())
    }

    while (occurrences.length > count) {
      occurrences.pop()?.remove()
    }
  }

  /**
   * Reconciles keyed occurrences with the fewest DOM operations: one removal
   * for each removed key, one insertion at the final position for each new
   * key, and moves only for surviving occurrences outside the longest run
   * that is already in the new relative order. The data is authoritative:
   * if other code reordered the elements, this restores the projected order.
   *
   * @param {ReadonlyArray<unknown>} keys
   */
  applyKeyed(keys) {
    const previous = this.occurrences
    const previousKeys = this.keys
    const count = keys.length

    // With the same keys in the same order, no occurrence is new, removed,
    // or reordered. Only the check against the live DOM order remains.
    if (
      previousKeys !== null
      && (previousKeys === keys || hasSameKeys(previousKeys, keys))
    ) {
      this.placeInOrder(previous, null)
      return
    }

    const matched = previousKeys === null
      ? null
      : matchIntegerKeys(previousKeys, keys)

    if (matched !== null) {
      const {sources, flags, ordered} = matched
      /** @type {ScopeState[]} */
      const next = new Array(count)

      for (let index = 0; index < count; index += 1) {
        const source = /** @type {number} */ (sources[index])

        next[index] = source === -1
          ? this.detachedOccurrence()
          : /** @type {ScopeState} */ (previous[source])
      }
      for (let index = 0; index < previous.length; index += 1) {
        if (flags[count + index] === 0) {
          previous[index]?.remove()
        }
      }

      this.placeInOrder(next, ordered ? null : flags)
      this.occurrences = next
      this.keys = keys
      return
    }

    /** @type {Map<unknown, number>} */
    const available = new Map()
    let pristineIndex = -1

    if (previousKeys === null) {
      pristineIndex = previous.length - 1
    } else {
      for (let index = 0; index < previous.length; index += 1) {
        available.set(previousKeys[index], index)
      }
    }

    /** @type {ScopeState[]} */
    const next = new Array(count)
    // The previous index of each occurrence, or -1 for a new occurrence.
    const sources = new Int32Array(count)
    // Old indexes of survivors, in new order, are increasing until the first
    // reorder. Only a reorder needs the longest-run computation.
    let lastSource = -1
    let ordered = true

    for (let index = 0; index < count; index += 1) {
      const key = keys[index]
      let source = available.get(key)

      if (source !== undefined) {
        available.delete(key)
      } else if (pristineIndex !== -1) {
        source = pristineIndex
        pristineIndex = -1
      }

      if (source === undefined) {
        next[index] = this.detachedOccurrence()
        sources[index] = -1
      } else {
        next[index] = /** @type {ScopeState} */ (previous[source])
        sources[index] = source

        if (source < lastSource) {
          ordered = false
        }
        lastSource = source
      }
    }

    if (pristineIndex !== -1) {
      previous[pristineIndex]?.remove()
    }
    for (const source of available.values()) {
      previous[source]?.remove()
    }

    this.placeInOrder(next, ordered ? null : stableOccurrences(sources))
    this.occurrences = next
    this.keys = keys
  }

  /**
   * Makes the live DOM order match the order of the occurrences.
   *
   * @param {ReadonlyArray<ScopeState>} next
   * @param {Uint8Array | null} stable 1 at each index that must not move in
   * the first walk, or null when no occurrence changed its relative order.
   */
  placeInOrder(next, stable) {
    const parent = this.anchor.parentNode

    if (parent === null) {
      throw new Error('Lumi array binding anchor lost its parent')
    }

    let reference = /** @type {Node} */ (this.anchor)

    // Without a reorder, every element is checked against the live DOM here,
    // so this one walk also repairs changes that other code made. A new
    // occurrence is detached, so its next sibling never matches: it gets one
    // insertion at its final position.
    for (let index = next.length - 1; index >= 0; index -= 1) {
      const element = /** @type {ScopeState} */ (next[index]).element

      if (
        (stable === null || stable[index] === 0)
        && element.nextSibling !== reference
      ) {
        // moveBefore keeps the state of an element that is already in the
        // parent, but it rejects a new element and one that other code
        // took out of the parent. Those elements are inserted.
        if (element.parentNode === parent) {
          parent.moveBefore(element, reference)
        } else {
          parent.insertBefore(element, reference)
        }
      }
      reference = element
    }

    // The longest run comes from the remembered order. Other code can
    // reorder the elements, so a second walk reads the live DOM and moves
    // only on a mismatch; without outside changes it moves nothing. The first
    // walk cannot do this check for a stable element, because its next
    // sibling can correctly be a lower-index element that has not moved yet.
    if (stable !== null) {
      this.placeInOrder(next, null)
    }
  }

  /** @returns {ScopeState} */
  createOccurrence() {
    const occurrence = this.detachedOccurrence()
    this.anchor.parentNode?.insertBefore(occurrence.element, this.anchor)
    return occurrence
  }

  /** @returns {ScopeState} */
  detachedOccurrence() {
    return new ScopeState(
      /** @type {Element} */ (
        this.anchor.ownerDocument.importNode(this.spec.target, true)
      ),
    )
  }

  destroy() {
    for (const occurrence of this.occurrences) {
      occurrence.remove()
    }
    this.occurrences = []
    this.anchor.remove()
  }
}

/**
 * Tells whether two key lists have the same keys in the same order.
 *
 * @param {ReadonlyArray<unknown>} left
 * @param {ReadonlyArray<unknown>} right
 */
function hasSameKeys(left, right) {
  const length = left.length

  if (right.length !== length) {
    return false
  }

  for (let index = 0; index < length; index += 1) {
    if (!sameKey(left[index], right[index])) {
      return false
    }
  }

  return true
}

/**
 * Resolves a declaration against its component boundary or, when it belongs
 * to a repeat binding list, against occurrences of that owning repeat only.
 *
 * @param {Element} root
 * @param {Runtime} runtime
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @returns {Element[]}
 */
function queryRuntimeElements(root, runtime, ownedSubtrees) {
  const selector = runtime.descriptor.selector

  if (runtime.scope === undefined) {
    return queryOwnedElements(root, selector, ownedSubtrees)
  }

  const elements = new Set()

  for (const scopeElement of queryRuntimeElements(
    root,
    runtime.scope,
    ownedSubtrees,
  )) {
    for (const element of queryOwnedElements(
      scopeElement,
      selector,
      ownedSubtrees,
    )) {
      elements.add(element)
    }
  }

  return [...elements]
}
