// @ts-check

/**
 * Shim for a browser that does not have moveBefore(). Lumi moves a repeated
 * element with moveBefore() and has no fallback of its own.
 *
 * Load this module before the first Lumi update, and only when the browser
 * needs it:
 *
 *   if (!('moveBefore' in Element.prototype)) {
 *     await import('@thlibjs/lumi/shims/move-before.js')
 *   }
 *
 * The shim moves the node with insertBefore(). The browser then resets the
 * state that a native move keeps, for example focus, a loaded iframe, and a
 * CSS animation.
 */

/**
 * Adds moveBefore() to the parent node types of a window that does not have
 * it. A window that has moveBefore() does not change.
 *
 * @param {object} view A window, or an object with its node constructors.
 */
export function installMoveBefore(view) {
  for (const name of ['Element', 'DocumentFragment', 'Document']) {
    Reflect.get(view, name).prototype.moveBefore ??= move
  }
}

/**
 * @this {ParentNode}
 * @param {Node} node
 * @param {Node | null} child
 */
function move(node, child) {
  this.insertBefore(node, child)
}

if (typeof Element === 'function') {
  installMoveBefore(globalThis)
}
