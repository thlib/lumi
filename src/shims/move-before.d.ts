/**
 * Adds moveBefore() to the parent node types of a window that does not have
 * it. A window that has moveBefore() does not change.
 *
 * The module calls this function for the global window when it loads.
 *
 * @param view A window, or an object with its node constructors.
 */
export function installMoveBefore(view: object): void
