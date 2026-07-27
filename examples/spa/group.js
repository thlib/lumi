// @ts-check

import {
  mountWithBoundaries,
  prepareMounted,
} from '../../src/component.js'

/**
 * Application-owned component composition.
 *
 * Lumi components continue to own only their own template and bindings.
 * A definition may compose independently reusable definitions into named
 * slots. This planner owns that group's coordinated mount, prepare, commit,
 * and unmount lifecycle.
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
 *   definition: Definition,
 *   select: (data: any) => any,
 * }} MountedMember
 */

/** @type {WeakMap<MountedGroup, (data: any) => import('../../src/types.js').PreparedUpdate>} */
const prepareByGroup = new WeakMap()

/**
 * Mounts one component definition and all of its declared members.
 *
 * Member containers are registered as ownership boundaries before the
 * containing component connects. Mount failure restores the target contents.
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
    mountMember(
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
        return member.definition.present(member.select(data))
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
 */
function mountMember(
  definition,
  target,
  select,
  outlets,
  mountedMembers,
) {
  const declarations = definition.members ?? []
  const boundarySelectors = [
    ...outlets,
    ...declarations.map(member => member.at),
  ]
  const {mounted, boundaries} = mountWithBoundaries(
    definition.component,
    target,
    boundarySelectors,
  )
  mountedMembers.push({mounted, definition, select})

  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index]
    const boundary = boundaries[outlets.length + index]

    if (declaration === undefined || boundary === undefined) {
      throw new Error('Invalid component group member declaration')
    }

    mountMember(
      declaration.definition,
      boundary,
      data => {
        const parentData = select(data)
        return declaration.select === undefined
          ? parentData
          : declaration.select(parentData)
      },
      [],
      mountedMembers,
    )
  }
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
