// @ts-check

/**
 * Tracked data. A tracked view is a native Proxy around plain application
 * data. Lumi records which data each part of the DOM reads, and a write
 * through the view updates only the parts that read the written data.
 *
 * Only `tracked` and `flush` are part of the supported package surface.
 */

/**
 * One piece of tracked data that a projection can read: one property of one
 * object, or the set of keys of one object.
 */
export class Dependency {
  constructor() {
    // Most dependencies have one subscriber, so the first one needs no Set.
    /** @type {Subscriber | null} */
    this.first = null
    /** @type {Set<Subscriber> | null} */
    this.others = null
  }

  /** @param {Subscriber} subscriber */
  add(subscriber) {
    if (this.first === subscriber) {
      return
    }

    if (this.first === null && this.others === null) {
      this.first = subscriber
      return
    }

    (this.others ??= new Set()).add(subscriber)
  }

  /** @param {Subscriber} subscriber */
  delete(subscriber) {
    if (this.first === subscriber) {
      this.first = null
    } else {
      this.others?.delete(subscriber)
    }
  }

  notify() {
    if (this.first !== null) {
      markChanged(this.first)
    }

    if (this.others !== null) {
      for (const subscriber of this.others) {
        markChanged(subscriber)
      }
    }
  }
}

/** @type {ReadonlyArray<Dependency>} */
const noDependencies = Object.freeze([])

/**
 * One part of a mounted component that Lumi can prepare again by itself.
 */
export class Subscriber {
  /**
   * @param {SubscriberQueue} queue
   * @param {unknown} owner
   * @param {number} depth Parts with a smaller depth are prepared first.
   */
  constructor(queue, owner, depth) {
    this.queue = queue
    this.owner = owner
    this.depth = depth
    /** @type {ReadonlyArray<Dependency>} */
    this.dependencies = noDependencies
    this.isChanged = false
    this.isReleased = false
  }
}

/**
 * The changed subscribers of one planner.
 */
export class SubscriberQueue {
  /** @param {() => void} schedule Requests a flush for the component. */
  constructor(schedule) {
    this.schedule = schedule
    /** @type {Subscriber[]} */
    this.changed = []
  }

  /**
   * Removes and returns the subscribers that still need preparation.
   *
   * @returns {Subscriber[]}
   */
  take() {
    const changed = this.changed

    if (changed.length === 0) {
      return changed
    }

    this.changed = []
    return [...new Set(changed)].filter(subscriber => {
      return subscriber.isChanged && !subscriber.isReleased
    })
  }

  /**
   * Returns subscribers whose preparation did not complete. A later write to
   * tracked data prepares them again.
   *
   * @param {ReadonlyArray<Subscriber>} subscribers
   */
  restore(subscribers) {
    for (const subscriber of subscribers) {
      if (subscriber.isChanged && !subscriber.isReleased) {
        this.changed.push(subscriber)
      }
    }
  }
}

/** @param {Subscriber} subscriber */
function markChanged(subscriber) {
  if (subscriber.isReleased) {
    return
  }

  if (!subscriber.isChanged) {
    subscriber.isChanged = true
    subscriber.queue.changed.push(subscriber)
  }

  // A subscriber can stay changed after a failed preparation. Each write
  // requests a flush, so the corrected data is prepared again.
  subscriber.queue.schedule()
}

/**
 * Makes a subscriber depend on the reads of its last preparation. The reads
 * are `reads[start]` to `reads[end - 1]`.
 *
 * @param {Subscriber | null} subscriber
 * @param {ReadonlyArray<Dependency>} reads
 * @param {number} start
 * @param {number} end
 * @param {SubscriberQueue | null} queue
 * @param {unknown} owner
 * @param {number} depth
 * @returns {Subscriber | null}
 */
export function syncSubscriber(
  subscriber,
  reads,
  start,
  end,
  queue,
  owner,
  depth,
) {
  const length = end - start

  if (subscriber === null) {
    if (length === 0 || queue === null) {
      return null
    }

    subscriber = new Subscriber(queue, owner, depth)
  }

  subscriber.isChanged = false

  const current = subscriber.dependencies
  const shared = Math.min(current.length, length)
  let same = 0

  while (same < shared && current[same] === reads[start + same]) {
    same += 1
  }

  // Most preparations read the same data in the same sequence.
  if (same === length && current.length === length) {
    return subscriber
  }

  for (let index = same; index < current.length; index += 1) {
    /** @type {Dependency} */ (current[index]).delete(subscriber)
  }

  const next = length === 0 ? noDependencies : reads.slice(start, end)

  // A removed dependency can also be in the part that did not change, so all
  // new dependencies are added. An addition that is already there is cheap.
  for (let index = 0; index < next.length; index += 1) {
    /** @type {Dependency} */ (next[index]).add(subscriber)
  }

  subscriber.dependencies = next
  return subscriber
}

/**
 * Stops all notifications to a subscriber.
 *
 * @param {Subscriber | null} subscriber
 */
export function releaseSubscriber(subscriber) {
  if (subscriber === null || subscriber.isReleased) {
    return
  }

  subscriber.isReleased = true

  for (const dependency of subscriber.dependencies) {
    dependency.delete(subscriber)
  }
  subscriber.dependencies = noDependencies
}

/**
 * The reads of the projections that run now. `reads` is null when no
 * projection runs. A read of tracked data adds its dependency to the list.
 *
 * @type {{reads: Dependency[] | null}}
 */
export const tracking = {reads: null}

/**
 * The tracker of each plain object that has a tracked view.
 *
 * @type {WeakMap<object, Tracker>}
 */
const trackers = new WeakMap()

/**
 * The plain object behind each tracked view.
 *
 * @type {WeakMap<object, object>}
 */
const plainByView = new WeakMap()

/**
 * The Proxy handler of one tracked view, and the dependencies of its object.
 */
class Tracker {
  /** @param {boolean} isList */
  constructor(isList) {
    this.isList = isList
    /** @type {Map<string, Dependency> | null} */
    this.properties = null
    /** @type {Dependency | null} */
    this.keys = null
    /** @type {object} */
    this.view = this
  }

  /**
   * @param {string} key
   * @returns {Dependency}
   */
  property(key) {
    const properties = this.properties ??= new Map()
    let dependency = properties.get(key)

    if (dependency === undefined) {
      dependency = new Dependency()
      properties.set(key, dependency)
    }

    return dependency
  }

  /**
   * The dependency on the set of keys. For a list, this is a dependency on
   * each element and on the length.
   *
   * @returns {Dependency}
   */
  keysDependency() {
    return this.keys ??= new Dependency()
  }

  /**
   * @param {object} target
   * @param {string | symbol} key
   * @param {unknown} receiver
   */
  get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver)

    if (typeof key === 'symbol') {
      return value
    }

    if (typeof value === 'function') {
      return this.isList ? listMethods.get(value) ?? value : value
    }

    const reads = tracking.reads

    if (reads !== null) {
      reads.push(this.property(key))
    }

    if (typeof value !== 'object' || value === null) {
      return value
    }

    return nestedView(target, key, value)
  }

  /**
   * @param {object} target
   * @param {string | symbol} key
   */
  has(target, key) {
    if (typeof key === 'string') {
      tracking.reads?.push(this.property(key))
    }

    return Reflect.has(target, key)
  }

  /** @param {object} target */
  ownKeys(target) {
    tracking.reads?.push(this.keysDependency())
    return Reflect.ownKeys(target)
  }

  /**
   * @param {object} target
   * @param {string | symbol} key
   */
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === 'string') {
      tracking.reads?.push(this.property(key))
    }

    return Reflect.getOwnPropertyDescriptor(target, key)
  }

  /**
   * @param {object} target
   * @param {string | symbol} key
   * @param {unknown} value
   * @param {unknown} receiver
   */
  set(target, key, value, receiver) {
    assertNoProjection()

    // The plain object holds plain values only.
    const next = plainOf(value)

    // An object that inherits from the view is not tracked data.
    if (receiver !== this.view) {
      return Reflect.set(target, key, next, receiver)
    }

    if (typeof key === 'symbol') {
      return Reflect.set(target, key, next, target)
    }

    const had = Object.hasOwn(target, key)
    const previous = had ? Reflect.get(target, key, target) : undefined
    const length = this.isList
      ? /** @type {unknown[]} */ (target).length
      : 0

    if (!Reflect.set(target, key, next, target)) {
      return false
    }

    this.changed(target, key, !had, !had || !Object.is(previous, next), length)
    return true
  }

  /**
   * @param {object} target
   * @param {string | symbol} key
   */
  deleteProperty(target, key) {
    assertNoProjection()

    const had = Object.hasOwn(target, key)

    if (!Reflect.deleteProperty(target, key)) {
      return false
    }

    if (had && typeof key === 'string') {
      this.properties?.get(key)?.notify()
      this.keys?.notify()
    }

    return true
  }

  /**
   * @param {object} target
   * @param {string | symbol} key
   * @param {PropertyDescriptor} descriptor
   */
  defineProperty(target, key, descriptor) {
    assertNoProjection()

    const had = Object.hasOwn(target, key)
    const length = this.isList
      ? /** @type {unknown[]} */ (target).length
      : 0
    const plain = Object.hasOwn(descriptor, 'value')
      ? {...descriptor, value: plainOf(descriptor.value)}
      : descriptor

    if (!Reflect.defineProperty(target, key, plain)) {
      return false
    }

    if (typeof key === 'string') {
      this.changed(target, key, !had, true, length)
    }

    return true
  }

  /**
   * Notifies the subscribers of one completed write.
   *
   * @param {object} target
   * @param {string} key
   * @param {boolean} isNewKey
   * @param {boolean} isNewValue
   * @param {number} previousLength The length of a list before the write.
   */
  changed(target, key, isNewKey, isNewValue, previousLength) {
    if (!this.isList) {
      if (isNewValue) {
        this.properties?.get(key)?.notify()
      }

      if (isNewKey) {
        this.keys?.notify()
      }
      return
    }

    const length = /** @type {unknown[]} */ (target).length

    if (key !== 'length' && isNewValue) {
      this.properties?.get(key)?.notify()
      this.keys?.notify()
    }

    if (length === previousLength) {
      return
    }

    this.properties?.get('length')?.notify()
    this.keys?.notify()

    if (length < previousLength && this.properties !== null) {
      // A shorter list has no elements at the removed positions.
      for (const [name, dependency] of this.properties) {
        const position = Number(name)

        if (Number.isInteger(position) && position >= length) {
          dependency.notify()
        }
      }
    }
  }
}

/**
 * Notifies the subscribers after a native method changed a list.
 *
 * @param {Tracker} tracker
 * @param {number} length
 * @param {number} previousLength
 */
function listChanged(tracker, length, previousLength) {
  tracker.keys?.notify()

  if (tracker.properties !== null) {
    for (const [name, dependency] of tracker.properties) {
      if (name !== 'length' || length !== previousLength) {
        dependency.notify()
      }
    }
  }
}

/**
 * The native methods that change a list, and their replacements for a tracked
 * list. Through a Proxy, a native method reads and writes each element with
 * one trap call. The replacement calls the native method on the plain list
 * and notifies the subscribers one time.
 *
 * @type {Map<unknown, (this: unknown, ...values: unknown[]) => unknown>}
 */
const listMethods = new Map()

for (const name of /** @type {const} */ ([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])) {
  const native = /** @type {(...values: unknown[]) => unknown} */ (
    Array.prototype[name]
  )

  listMethods.set(native, function (...values) {
    const plain = plainOf(this)
    const tracker = plain === this
      ? undefined
      : trackers.get(/** @type {object} */ (plain))

    // The method was moved to a list that is not tracked.
    if (tracker === undefined || !Array.isArray(plain)) {
      return Reflect.apply(native, this, values)
    }

    assertNoProjection()

    const previousLength = plain.length

    // The plain list holds plain values only. A comparison function of
    // `sort` gets the plain elements.
    for (let index = 0; index < values.length; index += 1) {
      values[index] = plainOf(values[index])
    }

    const result = Reflect.apply(native, plain, values)

    listChanged(tracker, plain.length, previousLength)

    if (result === plain) {
      return this
    }

    return Array.isArray(result) ? result.map(viewOf) : viewOf(result)
  })
}

/**
 * A projection calculates DOM state from data. A projection that changes the
 * data could cause an update for each update.
 */
function assertNoProjection() {
  if (tracking.reads !== null) {
    throw new TypeError('A Lumi projection must not change tracked data')
  }
}

/**
 * Returns the view of a value that a tracked object contains.
 *
 * @param {object} target
 * @param {string} key
 * @param {object} value
 * @returns {unknown}
 */
function nestedView(target, key, value) {
  const tracker = trackers.get(value)

  if (tracker === undefined && (plainByView.has(value) || !isPlain(value))) {
    return value
  }

  // A Proxy must return the actual value of a property that cannot change.
  const descriptor = Reflect.getOwnPropertyDescriptor(target, key)

  if (
    descriptor !== undefined
    && descriptor.configurable === false
    && descriptor.writable === false
  ) {
    return value
  }

  return tracker === undefined ? createView(value) : tracker.view
}

/**
 * Tells whether a value is a plain object or an array. Lumi tracks only
 * these, because a Proxy changes the behavior of other objects, for example
 * `Date` and `Map`.
 *
 * @param {object} value
 */
function isPlain(value) {
  if (Array.isArray(value)) {
    return true
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * @param {object} plain
 * @returns {object}
 */
function createView(plain) {
  const tracker = new Tracker(Array.isArray(plain))
  const view = new Proxy(plain, tracker)

  tracker.view = view
  trackers.set(plain, tracker)
  plainByView.set(view, plain)
  return view
}

/**
 * Returns the tracked view of a value from a tracked list. A value that is
 * not a plain object or an array is returned as it is.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function viewOf(value) {
  if (typeof value !== 'object' || value === null) {
    return value
  }

  const tracker = trackers.get(value)

  if (tracker !== undefined) {
    return tracker.view
  }

  return plainByView.has(value) || !isPlain(value)
    ? value
    : createView(value)
}

/**
 * Returns the plain object behind a tracked view. Any other value is returned
 * as it is.
 *
 * @template Value
 * @param {Value} value
 * @returns {Value}
 */
export function plainOf(value) {
  if (typeof value !== 'object' || value === null) {
    return value
  }

  return /** @type {Value} */ (plainByView.get(value) ?? value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTracked(value) {
  return typeof value === 'object' && value !== null && plainByView.has(value)
}

/**
 * Returns the dependency on each element and on the length of a plain list
 * that has a tracked view.
 *
 * @param {object} plain
 * @returns {Dependency | null}
 */
export function listDependency(plain) {
  return trackers.get(plain)?.keysDependency() ?? null
}

/**
 * Returns a tracked view of plain data.
 *
 * The view reads and writes the given object. When a component renders the
 * view, Lumi records the data that each part of the DOM reads. A later write
 * through the view updates only those parts. Lumi collects the writes and
 * applies them together in a microtask.
 *
 * Lumi tracks plain objects and arrays. It does not see a write that does not
 * go through the view.
 *
 * @template {object} Data
 * @param {Data} data A plain object or an array.
 * @returns {Data}
 */
export function tracked(data) {
  if (typeof data === 'object' && data !== null) {
    if (plainByView.has(data)) {
      return data
    }

    if (isPlain(data)) {
      return /** @type {Data} */ (viewOf(data))
    }
  }

  throw new TypeError('Lumi tracked data must be a plain object or an array')
}

/**
 * @typedef {object} Host One mounted component that can apply changes.
 * @property {number} order A parent component has a smaller order than its
 * child components.
 * @property {() => boolean} refresh Applies the changes. Returns false when
 * the component cannot apply them now.
 * @property {boolean} isPending
 */

let nextHostOrder = 0
/** @type {Host[]} */
let pendingHosts = []
let isScheduled = false
let isFlushing = false

/** A defect causes more passes than this limit. */
const passLimit = 100

/**
 * @param {() => boolean} refresh
 * @returns {Host}
 */
export function createHost(refresh) {
  nextHostOrder += 1
  return {order: nextHostOrder, refresh, isPending: false}
}

/**
 * Requests that a component applies its changes in the next flush.
 *
 * @param {Host} host
 */
export function scheduleHost(host) {
  if (host.isPending) {
    return
  }

  host.isPending = true
  pendingHosts.push(host)

  if (!isScheduled) {
    isScheduled = true
    queueMicrotask(() => {
      isScheduled = false
      flush()
    })
  }
}

/**
 * Applies the collected writes to tracked data now.
 *
 * Lumi applies the writes in a microtask without this call. Call `flush`
 * when code must read the updated DOM immediately after a write.
 *
 * @returns {void}
 */
export function flush() {
  if (isFlushing) {
    return
  }

  /** @type {unknown[]} */
  const errors = []
  /** @type {Host[]} */
  const busy = []
  let passes = 0

  isFlushing = true

  try {
    while (pendingHosts.length > 0) {
      passes += 1

      if (passes > passLimit) {
        // The changed parts stay changed. A later write applies them.
        for (const host of pendingHosts) {
          host.isPending = false
        }
        pendingHosts = []

        throw new Error(
          `Lumi tracked data changed during each of ${passLimit} updates`,
        )
      }

      const hosts = pendingHosts.sort((left, right) => {
        return left.order - right.order
      })
      pendingHosts = []

      for (const host of hosts) {
        host.isPending = false

        try {
          if (!host.refresh()) {
            busy.push(host)
          }
        } catch (error) {
          errors.push(error)
        }
      }
    }
  } finally {
    isFlushing = false

    for (const host of busy) {
      scheduleHost(host)
    }
  }

  if (errors.length === 1) {
    throw errors[0]
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Lumi could not apply tracked data')
  }
}
