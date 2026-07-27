// @ts-check

import {
  component,
  mountWithBoundaries,
  prepareMounted,
} from '../../src/component.js'

/**
 * Application-owned component composition.
 *
 * Lumi components continue to own only their own template and bindings.
 * A composite definition stacks independently reusable definitions in an
 * ordered list. This planner owns that group's coordinated mount, prepare,
 * commit, and unmount lifecycle.
 */

/**
 * @typedef {import('./demo-components.js').Definition} Definition
 */

/**
 * @typedef {{
 *   root: Element,
 *   update: (data: any) => void,
 *   unmount: () => void,
 * }} MountedGroup
 */

/**
 * @typedef {{
 *   mounted: import('../../src/types.js').MountedComponent<any>,
 *   present: (data: any) => any,
 *   select: (data: any) => any,
 * }} MountedMember
 */

/** @type {WeakMap<MountedGroup, (data: any) => import('../../src/types.js').PreparedUpdate>} */
const prepareByGroup = new WeakMap()
/** @type {WeakMap<object, import('../../src/types.js').Component<any>>} */
const componentByEntry = new WeakMap()

/**
 * Mounts one leaf or composite component definition.
 *
 * Composite entries are reduced by target before anything mounts, so a later
 * entry replaces an earlier entry for the same `at` selector. The remaining
 * containers are registered as ownership boundaries before the containing
 * component connects. Mount failure restores the target contents.
 *
 * @param {Definition} definition
 * @param {Element | null} target
 * @param {{outlets?: ReadonlyArray<string>}} [options]
 * @returns {MountedGroup}
 */
export function mountGroup(definition, target, options = {}) {
  if (target === null) {
    throw new TypeError('Expected component group mount target to be an Element')
  }

  const view = target.ownerDocument.defaultView

  if (view === null || !(target instanceof view.Element)) {
    throw new TypeError('Expected component group mount target to be an Element')
  }

  /** @type {MountedMember[]} */
  const members = []
  const previousChildren = Array.from(target.childNodes)

  try {
    mountDefinition(
      definition,
      target,
      data => data,
      options.outlets ?? [],
      members,
    )
  } catch (error) {
    unmountMembers(members)
    target.replaceChildren(...previousChildren)
    throw error
  }

  const root = members[0]?.mounted.root

  if (root === undefined) {
    throw new Error('A component group requires a root component')
  }

  let isMounted = true
  let isUpdating = false
  let isFaulted = false

  /**
   * @param {any} data
   * @returns {import('../../src/types.js').PreparedUpdate}
   */
  function prepare(data) {
    if (!isMounted) {
      throw new Error('Cannot update an unmounted component group')
    }

    if (isFaulted) {
      throw new Error(
        'Cannot update a faulted component group; unmount it and mount again',
      )
    }

    if (isUpdating) {
      throw new Error('Cannot update a component group recursively')
    }

    isUpdating = true
    /** @type {Array<import('../../src/types.js').PreparedUpdate>} */
    const prepared = []

    try {
      // Every presentation is derived before any component starts preparing.
      // This keeps presentation failures independent from renderer state.
      const presentations = members.map(member => {
        return member.present(member.select(data))
      })

      for (let index = 0; index < members.length; index += 1) {
        const member = members[index]

        if (member === undefined) {
          throw new Error('Invalid mounted component group member')
        }

        prepared.push(prepareMounted(
          member.mounted,
          presentations[index],
        ))
      }
    } catch (error) {
      discardPrepared(prepared)
      isUpdating = false
      throw error
    }

    let isSettled = false

    return {
      commit() {
        if (isSettled) {
          throw new Error('Cannot commit a settled component group update')
        }

        let commitIndex = 0

        try {
          for (; commitIndex < prepared.length; commitIndex += 1) {
            prepared[commitIndex]?.commit()
          }
        } catch (error) {
          isFaulted = true
          discardPrepared(prepared, commitIndex + 1)
          throw error
        } finally {
          isSettled = true
          isUpdating = false
        }
      },

      discard() {
        if (isSettled) {
          return
        }

        discardPrepared(prepared)
        isSettled = true
        isUpdating = false
      },
    }
  }

  const mountedGroup = Object.freeze({
    root,

    /** @param {any} data */
    update(data) {
      prepare(data).commit()
    },

    unmount() {
      if (!isMounted) {
        return
      }

      if (isUpdating) {
        throw new Error('Cannot unmount a component group during an update')
      }

      const cleanupError = unmountMembers(members)
      isMounted = false

      if (cleanupError !== undefined) {
        throw cleanupError
      }
    },
  })

  prepareByGroup.set(mountedGroup, prepare)
  return mountedGroup
}

/**
 * Updates several independently mounted groups as one prepared unit.
 *
 * @param {ReadonlyArray<MountedGroup>} groups
 * @param {any} data
 */
export function updateGroups(groups, data) {
  /** @type {Array<import('../../src/types.js').PreparedUpdate>} */
  const prepared = []

  try {
    for (const group of groups) {
      const prepare = prepareByGroup.get(group)

      if (prepare === undefined) {
        throw new TypeError('Expected a mounted component group')
      }

      prepared.push(prepare(data))
    }
  } catch (error) {
    discardPrepared(prepared)
    throw error
  }

  let commitIndex = 0

  try {
    for (; commitIndex < prepared.length; commitIndex += 1) {
      prepared[commitIndex]?.commit()
    }
  } catch (error) {
    discardPrepared(prepared, commitIndex + 1)
    throw error
  }
}

/**
 * @param {Definition} definition
 * @param {Element} target
 * @param {(data: any) => any} select
 * @param {ReadonlyArray<string>} outlets
 * @param {MountedMember[]} mountedMembers
 * @returns {ReadonlyArray<Element>}
 */
function mountDefinition(
  definition,
  target,
  select,
  outlets,
  mountedMembers,
) {
  if (!isDefinition(definition)) {
    throw new TypeError('A component definition requires "components"')
  }

  const entries = effectiveEntries(definition.components)
  const rootEntry = entries.find(entry => entry.at === undefined)

  if (rootEntry === undefined) {
    throw new Error('A component stack requires a root entry without "at"')
  }

  const placedEntries = entries.filter(entry => entry.at !== undefined)
  const selectors = [
    ...outlets,
    ...placedEntries.map(entry => /** @type {string} */ (entry.at)),
  ]
  /** @type {ReadonlyArray<Element>} */
  const boundaries = mountEntry(
    rootEntry,
    target,
    selectedBy(select, rootEntry.select),
    selectors,
    mountedMembers,
  )

  for (let index = 0; index < placedEntries.length; index += 1) {
    const entry = placedEntries[index]
    const boundary = boundaries[outlets.length + index]

    if (entry === undefined || boundary === undefined) {
      throw new Error('Invalid component stack entry')
    }

    mountEntry(
      entry,
      boundary,
      selectedBy(select, entry.select),
      [],
      mountedMembers,
    )
  }

  return boundaries.slice(0, outlets.length)
}

/**
 * @param {import('./demo-components.js').ComponentEntry} entry
 * @param {Element} target
 * @param {(data: any) => any} select
 * @param {ReadonlyArray<string>} outlets
 * @param {MountedMember[]} mountedMembers
 * @returns {ReadonlyArray<Element>}
 */
function mountEntry(entry, target, select, outlets, mountedMembers) {
  if (Reflect.has(entry, 'use')) {
    return mountDefinition(
      /** @type {{use: Definition}} */ (entry).use,
      target,
      select,
      outlets,
      mountedMembers,
    )
  }

  if (!isInlineComponent(entry)) {
    throw new TypeError(
      'A component stack entry requires either "use" or template and present',
    )
  }

  let definition = componentByEntry.get(entry)

  if (definition === undefined) {
    definition = component(entry.bindings === undefined
      ? {template: entry.template}
      : {template: entry.template, bindings: entry.bindings})
    componentByEntry.set(entry, definition)
  }

  const {mounted, boundaries} = mountWithBoundaries(
    definition,
    target,
    outlets,
  )
  mountedMembers.push({mounted, present: entry.present, select})
  return boundaries
}

/**
 * Keeps only the last entry for each target while retaining the declaration
 * order of the entries that survive.
 *
 * @param {ReadonlyArray<import('./demo-components.js').ComponentEntry>} entries
 * @returns {ReadonlyArray<import('./demo-components.js').ComponentEntry>}
 */
function effectiveEntries(entries) {
  /** @type {Map<string | undefined, number>} */
  const lastIndexByTarget = new Map()

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]

    if (entry === undefined) {
      throw new TypeError('Invalid component stack entry')
    }

    assertComponentEntry(entry)

    if (
      entry.at !== undefined
      && (typeof entry.at !== 'string' || entry.at.length === 0)
    ) {
      throw new TypeError('A component stack "at" must be a non-empty string')
    }

    lastIndexByTarget.set(entry.at, index)
  }

  return entries.filter((entry, index) => {
    return lastIndexByTarget.get(entry.at) === index
  })
}

/**
 * Validates one reusable reference or inline component specification.
 *
 * @param {import('./demo-components.js').ComponentEntry} entry
 */
function assertComponentEntry(entry) {
  const hasUse = Reflect.has(entry, 'use')
  const hasInlineComponent = isInlineComponent(entry)

  if (hasUse === hasInlineComponent) {
    throw new TypeError(
      'A component stack entry requires either "use" or template and present',
    )
  }
}

/**
 * @param {(data: any) => any} parent
 * @param {((data: any) => any) | undefined} select
 * @returns {(data: any) => any}
 */
function selectedBy(parent, select) {
  return data => {
    const parentData = parent(data)
    return select === undefined ? parentData : select(parentData)
  }
}

/**
 * @param {unknown} entry
 * @returns {entry is import('./demo-components.js').InlineComponent}
 */
function isInlineComponent(entry) {
  return typeof entry === 'object'
    && entry !== null
    && Reflect.has(entry, 'template')
    && Reflect.has(entry, 'present')
}

/**
 * @param {unknown} definition
 * @returns {definition is Definition}
 */
function isDefinition(definition) {
  return typeof definition === 'object'
    && definition !== null
    && Reflect.has(definition, 'components')
    && Array.isArray(Reflect.get(definition, 'components'))
}

/**
 * @param {ReadonlyArray<import('../../src/types.js').PreparedUpdate>} prepared
 * @param {number} [start]
 */
function discardPrepared(prepared, start = 0) {
  for (let index = prepared.length - 1; index >= start; index -= 1) {
    try {
      prepared[index]?.discard?.()
    } catch {
      // Preserve the projection, preparation, or commit error.
    }
  }
}

/**
 * @param {ReadonlyArray<MountedMember>} members
 * @returns {unknown}
 */
function unmountMembers(members) {
  /** @type {unknown} */
  let firstError

  for (let index = members.length - 1; index >= 0; index -= 1) {
    try {
      members[index]?.mounted.unmount()
    } catch (error) {
      firstError ??= error
    }
  }

  return firstError
}
