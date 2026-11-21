// @ts-check

/**
 * Package-internal DOM planning primitives. The supported package surface is
 * exported only from index.js.
 *
 * @internal
 */

import {
  createElementQuery,
  elementPath,
  importElementTree,
  markCreated,
  pairElementTrees,
  queryOwnedElements,
  tasksByDepth,
} from './dom.js'
import { connectCardinalityDomBindings } from './cardinality.js'
import {warn} from './internal/diagnostics.js'
import { noValue } from './internal/no-value.js'
import { projectionError } from './internal/projection-error.js'
import {rootContext} from './internal/projection-context.js'
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
// Marks a batch match that an earlier hoisted content operation planned.
const unplannedMatch = Symbol('Lumi unplanned match')

/**
 * @typedef {string | number | boolean} TextValue
 */

/**
 * @typedef {ReturnType<typeof createElementQuery>} ElementQuery
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
 * declaration that owns this declaration. The repeat planner sets it.
 * @property {WeakMap<Element, CachedValue>} values The last value that a
 * property binding gave to each element. Other bindings do not use it.
 * @property {boolean} requiresTrustedHTML
 * @property {Set<string> | null} warnings The categories of the warnings
 * that the declaration has reported.
 * @property {Window | null} view
 * @property {(projected: unknown) => unknown} normalize
 * @property {(element: Element, value: unknown) => boolean} apply
 * @property {(element: Element, value: unknown) => boolean} changes
 */

/**
 * The prepared values for consecutive selector matches of one declaration,
 * from the match at `start`. `count` is the number of matches when the
 * values were prepared. A value of `unplannedMatch` marks a match that an
 * earlier operation planned.
 *
 * @template Data
 * @typedef {object} DomOperation
 * @property {DomBindingRuntime<Data>} runtime
 * @property {number} start
 * @property {number} count
 * @property {ReadonlyArray<unknown>} values
 */

/**
 * One committed write of a content property.
 *
 * @template Data
 * @typedef {object} ContentWrite
 * @property {DomBindingRuntime<Data>} runtime
 * @property {Element} element
 * @property {boolean} isRefined Whether a later operation changed a
 * descendant of the element.
 * @property {boolean} isSuperseded Whether a later content write replaced
 * the contents of the same element.
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
 * Returns Lumi's internal descriptor for a built-in scalar binding.
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
 * repeat so the cardinality planner can resolve their selectors locally.
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
 * Connects all built-in scalar declarations to one DOM-aware update planner.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingDescriptor<Data>>} descriptors
 * @param {ReadonlyArray<Element>} [ownedSubtrees]
 * @param {(roots: ReadonlySet<ShadowRoot>) => void} [publishShadowRoots]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
export function connectDomBindings(
  root,
  descriptors,
  ownedSubtrees = [],
  publishShadowRoots,
) {
  const trustedTypes = descriptors.some(requiresTrustedHTML)
    ? trustedTypesFactory(root)
    : null
  const runtimes = descriptors.map((descriptor, index) => {
    return createDomBindingRuntime(descriptor, index, root, trustedTypes)
  })

  if (!descriptors.some(descriptor => descriptor.kind === 'repeat')) {
    return connectScalarDomBindings(
      root,
      runtimes,
      ownedSubtrees,
      publishShadowRoots,
    )
  }

  return connectCardinalityDomBindings(
    root,
    importElementTree(
      root.ownerDocument.implementation.createHTMLDocument(),
      root,
    ),
    runtimes,
    ownedSubtrees.map(subtree => elementPath(root, subtree)),
  )
}

/**
 * Tells whether a declaration writes markup, which must be TrustedHTML.
 *
 * @param {{kind: string, name?: string}} descriptor
 */
function requiresTrustedHTML(descriptor) {
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
 * `apply` writes a value and tells whether the live DOM changed. `changes`
 * is a read-only check that tells whether applying one value to the current
 * DOM can change the result of a later selector resolution. Any attribute,
 * class token, property, or inline style write can do that. A text write
 * changes only text when the element keeps one non-empty text node, so only
 * a write that changes the element's child nodes otherwise (for example the
 * result of `:empty`) is a change.
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
    requiresTrustedHTML: requiresTrustedHTML(descriptor),
    warnings: null,
    view: root.ownerDocument.defaultView,
    normalize: projected => projected ?? noValue,
    apply: () => false,
    changes: () => false,
  }

  /**
   * Sets `apply` and `changes` for a binding whose current DOM value can be
   * read and compared with the normalized value.
   *
   * @param {(element: Element) => unknown} read
   * @param {(element: Element, value: any) => void} write
   */
  const useDomValue = (read, write) => {
    runtime.apply = (element, value) => {
      if (read(element) === value) {
        return false
      }

      write(element, value)
      return true
    }
    runtime.changes = (element, value) => read(element) !== value
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
      runtime.normalize = projected => {
        return isTextValue(projected)
          ? String(projected)
          : ignore(runtime, projected, textValues)
      }
      runtime.apply = (element, value) => {
        const text = /** @type {string} */ (value)
        const sink = /** @type {TextSink} */ (element)
        const written = sink[writtenText]

        if (written === text) {
          return false
        }

        sink[writtenText] = text

        // Without a remembered value, the element has its source content.
        // One read keeps the first update free of a redundant write.
        if (written === undefined && element.textContent === text) {
          return false
        }

        // Keep the text node when the element has only that node. An empty
        // value removes all child nodes, as `textContent` does.
        const first = element.firstChild

        if (
          text !== ''
          && first !== null
          && first.nodeType === 3
          && first.nextSibling === null
        ) {
          /** @type {Text} */ (first).data = text
        } else {
          element.textContent = text
        }

        return true
      }
      runtime.changes = (element, value) => {
        if (/** @type {TextSink} */ (element)[writtenText] === value) {
          return false
        }

        const first = element.firstChild

        if (
          value !== ''
          && first !== null
          && first.nodeType === 3
          && first.nextSibling === null
          && /** @type {Text} */ (first).data !== ''
        ) {
          return false
        }

        return element.textContent !== value
      }
      break
    case 'property':
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
      runtime.apply = (element, value) => {
        const shouldWrite = runtime.changes(element, value)

        if (shouldWrite) {
          setProperty(element, name, value)

          if (runtime.structural) {
            /** @type {TextSink} */ (element)[writtenText] = undefined
          }
        }

        runtime.values.set(element, {
          projectedValue: projectedCacheValue(runtime, value),
          domValue: /** @type {any} */ (element)[name],
        })
        return shouldWrite
      }
      runtime.changes = (element, value) => {
        return !isPropertyCurrent(
          /** @type {any} */ (element)[name],
          projectedCacheValue(runtime, value),
          runtime.values.get(element),
        )
      }
      break
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
        element => {
          return element.hasAttribute(name)
            && (element.getAttribute(name) ?? '')
        },
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
 * Connects the planner for a component without a repeat binding. Each update
 * resolves every selector again. Content writes that can remove or create
 * elements are planned first, in DOM ancestor order, so the selectors for
 * their descendants see the planned result. All other writes are planned in
 * declaration order: each declaration resolves its selector after the
 * earlier planned writes.
 *
 * @template Data
 * @param {Element} root
 * @param {ReadonlyArray<DomBindingRuntime<Data>>} runtimes
 * @param {ReadonlyArray<Element>} ownedSubtrees
 * @param {(roots: ReadonlySet<ShadowRoot>) => void} [publishShadowRoots]
 * @returns {import('./types.js').ConnectedBinding<Data>}
 */
function connectScalarDomBindings(
  root,
  runtimes,
  ownedSubtrees,
  publishShadowRoots,
) {
  const contentRuntimes = runtimes.filter(runtime => runtime.structural)
  const lastRuntime = runtimes[runtimes.length - 1]
  /** @type {Document | null} */
  let planningDocument = null

  return {
    prepare(data) {
      const context = rootContext(data)
      const liveQuery = createElementQuery(root)
      // The planning view is the live tree, which the plan only reads, until
      // a prepared write can change the result of a later selector
      // resolution. From then on, the view is an inert copy that receives
      // the planned writes. The operations and the projection calls have
      // the same order in the two views, and each projection runs one time.
      let view = root
      let owned = ownedSubtrees
      let query = liveQuery
      /** @type {WeakMap<Element, Element> | null} */
      let liveByPlanned = null
      /**
       * The matches of each declaration in the live view. Null in the copy,
       * where a planned write can change the matches.
       *
       * @type {Array<Element[] | undefined> | null}
       */
      let liveMatches = []
      // Tells whether a prepared write can change a later selector result.
      let changesMatches = false
      // The last declaration is resolved before its own writes, and no other
      // declaration is resolved after it.
      let isLastBatch = false
      // False until a content task is planned or a write creates elements.
      let hasPlannedContent = false
      /** @type {Array<DomOperation<Data>>} */
      const operations = []
      /** @type {Map<DomBindingRuntime<Data>, WeakSet<Element>>} */
      const hoistedByRuntime = new Map()
      /** @type {WeakMap<Element, ReadonlySet<number>>} */
      const createdBy = new WeakMap()

      /** @param {DomBindingRuntime<Data>} runtime */
      const matchesOf = runtime => {
        const known = liveMatches?.[runtime.index]

        if (known !== undefined) {
          return known
        }

        const elements = queryOwnedElements(
          view,
          runtime.descriptor.selector,
          owned,
          query,
        )

        if (liveMatches !== null) {
          liveMatches[runtime.index] = elements
        }

        return elements
      }

      /**
       * Tells whether a content task planned this match, or whether the
       * declaration created the element. A declaration cannot select its
       * own output again.
       *
       * @param {DomBindingRuntime<Data>} runtime
       * @param {Element} element
       */
      const isPlanned = (runtime, element) => {
        return hasPlannedContent
          && (
            hoistedByRuntime.get(runtime)?.has(element) === true
            || createdBy.get(element)?.has(runtime.index) === true
          )
      }

      /**
       * @param {DomBindingRuntime<Data>} runtime
       * @param {Element} element
       */
      const markHoisted = (runtime, element) => {
        let hoisted = hoistedByRuntime.get(runtime)

        if (hoisted === undefined) {
          hoisted = new WeakSet()
          hoistedByRuntime.set(runtime, hoisted)
        }

        hoisted.add(element)
        hasPlannedContent = true
      }

      /**
       * Plans one value for one match. In the live view, this only finds
       * whether the write can change a later selector result. In the copy,
       * this applies the write.
       *
       * @param {DomBindingRuntime<Data>} runtime
       * @param {Element} element
       * @param {unknown} value
       */
      const plan = (runtime, element, value) => {
        if (value === noValue) {
          return
        }

        const kind = runtime.descriptor.kind
        const name = /** @type {string} */ (runtime.descriptor.name)

        if (runtime.structural) {
          assertDoesNotReplaceOwnedSubtree(element, owned)

          if (name === 'outerHTML' && element === view) {
            throw new TypeError(
              'Lumi cannot replace a mounted component root with outerHTML',
            )
          }
        }

        if (liveByPlanned === null) {
          changesMatches ||= !isLastBatch && runtime.changes(element, value)
          return
        }

        if (kind !== 'property') {
          runtime.apply(element, value)
          return
        }

        const live = liveByPlanned.get(element)

        if (
          isPropertyCurrent(
            /** @type {any} */ (element)[name],
            projectedCacheValue(runtime, value),
            live === undefined ? undefined : runtime.values.get(live),
          )
        ) {
          return
        }

        const parent = element.parentNode
        const previous = element.previousSibling
        const next = element.nextSibling

        setProperty(element, name, value)
        // The commit forgets the remembered text of the element also.
        ;/** @type {TextSink} */ (element)[writtenText] = undefined

        const history = new Set(createdBy.get(element)).add(runtime.index)
        hasPlannedContent = true

        if (name === 'innerHTML' || name === 'innerText') {
          markCreated(element.firstChild, null, createdBy, history)
        } else if (name === 'outerHTML' && parent !== null) {
          markCreated(
            previous === null ? parent.firstChild : previous.nextSibling,
            next,
            createdBy,
            history,
          )
        }
      }

      /**
       * Moves the plan from the live view to an inert copy of the component.
       */
      const stage = () => {
        // Import into a document without a browsing context or
        // custom-element registry. Unlike cloneNode() in the live document,
        // this cannot invoke custom-element constructors merely to prepare
        // an update. Each update imports a new detached copy, so one
        // document serves all updates.
        planningDocument ??= root.ownerDocument.implementation
          .createHTMLDocument()
        const copy = importElementTree(planningDocument, root)
        /** @type {WeakMap<Element, Element>} */
        const lives = new WeakMap()
        /** @type {WeakMap<Element, Element>} */
        const plannedByLive = new WeakMap()
        pairElementTrees(root, copy, (live, planned) => {
          lives.set(planned, live)
          plannedByLive.set(live, planned)

          // The commit does not write a remembered text again, so the copy
          // must remember the same text.
          const written = /** @type {TextSink} */ (live)[writtenText]

          if (written !== undefined) {
            /** @type {TextSink} */ (planned)[writtenText] = written
          }
        })

        /** @param {Element | undefined} live */
        const plannedElement = live => {
          const planned = live === undefined
            ? undefined
            : plannedByLive.get(live)

          if (planned === undefined) {
            throw new Error('Lumi lost a DOM target while planning')
          }

          return planned
        }

        const matches = liveMatches ?? []
        liveMatches = null
        liveByPlanned = lives
        view = copy
        owned = ownedSubtrees.map(live => plannedElement(live))
        // Planned content writes cannot attach a shadow root, so the shadow
        // topology of the copy can only become smaller. One query stays
        // correct.
        query = createElementQuery(copy)

        // The operations were resolved in the unchanged live view, which
        // equals the copy until the last of them. Replay them in the same
        // order.
        for (const {runtime, start, values} of operations) {
          const elements = matches[runtime.index] ?? []

          for (let index = 0; index < values.length; index += 1) {
            const value = values[index]

            if (value !== unplannedMatch) {
              const element = plannedElement(elements[start + index])

              if (runtime.structural) {
                markHoisted(runtime, element)
              }

              plan(runtime, element, value)
            }
          }
        }
      }

      // The matches where a content write can remove or create elements.
      const contentTasks = () => {
        return tasksByDepth(
          view,
          contentRuntimes,
          matchesOf,
          (runtime, element) => {
            // A text write to an element without element children changes
            // only text, so it keeps its declaration order.
            const name = runtime.descriptor.name

            return (
              (name !== undefined && name !== 'textContent')
              || element.firstElementChild !== null
            ) && !isPlanned(runtime, element)
          },
        )
      }

      // In the live view, no task changes the tasks that follow it. In the
      // copy, each task can remove or create the targets of other tasks.
      for (let tasks = contentTasks(), next = 0; next < tasks.length;) {
        const {runtime, element, matchIndex, count} = /** @type {typeof tasks[0]} */ (
          tasks[next]
        )
        const value = projectValue(runtime, context, element, matchIndex)

        operations.push({ runtime, start: matchIndex, count, values: [value] })
        markHoisted(runtime, element)
        plan(runtime, element, value)

        if (changesMatches && liveByPlanned === null) {
          stage()
        }

        if (liveByPlanned === null) {
          next += 1
        } else {
          tasks = contentTasks()
          next = 0
        }
      }

      for (const runtime of runtimes) {
        const elements = matchesOf(runtime)
        let planned = false
        const values = elements.map((element, matchIndex) => {
          if (isPlanned(runtime, element)) {
            return unplannedMatch
          }

          planned = true
          return projectValue(runtime, context, element, matchIndex)
        })

        if (!planned) {
          continue
        }

        operations.push({ runtime, start: 0, count: elements.length, values })
        isLastBatch = runtime === lastRuntime

        for (let index = 0; index < elements.length; index += 1) {
          if (values[index] !== unplannedMatch) {
            plan(
              runtime,
              /** @type {Element} */ (elements[index]),
              values[index],
            )
          }
        }

        if (changesMatches && liveByPlanned === null) {
          stage()
        }
      }

      return {
        commit() {
          // Custom binding commits run between preparation and this DOM
          // commit. Refresh once in case one changed the component's shadow
          // topology.
          liveQuery.invalidate()
          // A content property can establish content that the rules for
          // descendants refine. Its cache then gets the final refined DOM,
          // not the intermediate write, so the next update does not rebuild
          // a subtree that is still correct. A later content write to the
          // same element supersedes the earlier write.
          /** @type {Array<ContentWrite<Data>>} */
          const contentWrites = []

          for (const {runtime, start, count, values} of operations) {
            const selector = runtime.descriptor.selector
            const elements = queryOwnedElements(
              root,
              selector,
              ownedSubtrees,
              liveQuery,
            )

            if (elements.length !== count) {
              throw new Error(
                `Lumi DOM changed while committing selector "${selector}"`,
              )
            }

            for (let index = 0; index < values.length; index += 1) {
              const value = values[index]

              if (value !== unplannedMatch && value !== noValue) {
                const element = /** @type {Element} */ (
                  elements[start + index]
                )

                for (const write of contentWrites) {
                  if (write.element === element) {
                    write.isSuperseded ||= runtime.structural
                  } else {
                    write.isRefined ||= write.element.contains(element)
                  }
                }

                if (
                  runtime.structural
                  && runtime.descriptor.kind === 'property'
                  && runtime.descriptor.name !== 'outerHTML'
                ) {
                  contentWrites.push({
                    runtime,
                    element,
                    isRefined: false,
                    isSuperseded: false,
                  })
                }

                if (runtime.apply(element, value)) {
                  liveQuery.recheck(element)
                }
              }
            }
          }

          for (const write of contentWrites) {
            if (write.isRefined && !write.isSuperseded) {
              /** @type {CachedValue} */ (
                write.runtime.values.get(write.element)
              ).domValue = /** @type {any} */ (write.element)[
                /** @type {string} */ (write.runtime.descriptor.name)
              ]
            }
          }

          publishShadowRoots?.(liveQuery.openShadowRoots())
        },
      }
    },

    destroy() {
      planningDocument = null
    },
  }
}

/**
 * Keeps the authenticated TrustedHTML object intact for the native setter,
 * while comparing its immutable string data with the DOM's serialized value.
 *
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {unknown} value
 * @returns {unknown}
 */
function projectedCacheValue(runtime, value) {
  return runtime.requiresTrustedHTML ? String(value) : value
}

/**
 * @template Data
 * @param {DomBindingRuntime<Data>} runtime
 * @param {import('./types.js').ProjectionContext<Data, Data>} context
 * @param {Element} element
 * @param {number} matchIndex
 * @returns {unknown}
 */
function projectValue(runtime, context, element, matchIndex) {
  const descriptor = runtime.descriptor
  let projected

  try {
    projected = descriptor.project(context, element)
  } catch (error) {
    throw projectionError(descriptor, matchIndex, error)
  }

  return runtime.normalize(projected)
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
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 */
function setProperty(element, name, value) {
  if (!Reflect.set(element, name, value)) {
    throw new TypeError(
      `Lumi could not set property "${name}" on <${element.localName}>`,
    )
  }
}

/**
 * Returns whether a property already holds the projected value, either
 * directly or as the value that the browser kept after the previous write.
 *
 * @param {unknown} current
 * @param {unknown} projectedValue
 * @param {CachedValue | undefined} previous
 * @returns {boolean}
 */
function isPropertyCurrent(current, projectedValue, previous) {
  return Object.is(current, projectedValue)
    || (
      previous !== undefined
      && Object.is(previous.projectedValue, projectedValue)
      && Object.is(previous.domValue, current)
    )
}

/**
 * @param {Element} target
 * @param {ReadonlyArray<Element>} ownedSubtrees
 */
function assertDoesNotReplaceOwnedSubtree(target, ownedSubtrees) {
  for (const owned of ownedSubtrees) {
    if (target.contains(owned)) {
      throw new Error(
        'Lumi content binding cannot replace a child subtree',
      )
    }
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
