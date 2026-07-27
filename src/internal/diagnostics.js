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
  if (!isDevelopment()) {
    return
  }

  const consoleValue = Reflect.get(target ?? globalThis, 'console')
  const fn = typeof consoleValue === 'object' && consoleValue !== null
    ? Reflect.get(consoleValue, 'warn')
    : undefined

  if (typeof fn === 'function') {
    Reflect.apply(fn, consoleValue, [msg])
  }
}

/**
 * Development diagnostics stay on unless the host declares a production
 * environment through the established package-tooling convention.
 */
function isDevelopment() {
  const process = Reflect.get(globalThis, 'process')

  if (typeof process !== 'object' || process === null) {
    return true
  }

  const environment = Reflect.get(process, 'env')

  if (typeof environment !== 'object' || environment === null) {
    return true
  }

  return Reflect.get(environment, 'NODE_ENV') !== 'production'
}
