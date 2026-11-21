// @ts-check

/**
 * Emits one recoverable development diagnostic at the standard warning
 * severity. The optional global selects the console associated with mounted
 * DOM while environment detection remains a host concern.
 *
 * @param {string} msg
 * @param {typeof globalThis | Window | null} [target]
 */
export function warn(msg, target = globalThis) {
  const host = /** @type {any} */ (globalThis)
  const console = /** @type {any} */ (target ?? globalThis).console

  // Development is the default; a host reports production with NODE_ENV.
  if (
    host.process?.env?.NODE_ENV !== 'production'
    && typeof console?.warn === 'function'
  ) {
    console.warn(msg)
  }
}
