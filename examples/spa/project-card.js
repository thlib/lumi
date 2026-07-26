// @ts-check

import {bind, classToggle, style} from '../../src/index.js'

/**
 * The project card appears on two pages. Its markup stays in each page's
 * template, and the rules that are not expressible as `data-bind` paths are
 * packaged here as ordinary Lumi bindings both pages can spread into their
 * own binding list.
 *
 * @template {{projects: ReadonlyArray<{
 *   accent: string,
 *   progress: number,
 *   status: string,
 * }>}} Data
 * @returns {ReadonlyArray<import('../../src/types.js').Binding<Data>>}
 */
export function bindProjectCards() {
  return [
    bind(
      '[data-project-progress]',
      data => data.projects.map(project => `${project.progress}%`),
    ),
    style(
      '[data-project-accent]',
      'background-color',
      data => data.projects.map(project => project.accent),
    ),
    style(
      '[data-project-progress-bar]',
      'width',
      data => data.projects.map(project => `${project.progress}%`),
    ),
    classToggle(
      '[data-project-status]',
      'status--planning',
      data => data.projects.map(project => project.status === 'Planning'),
    ),
  ]
}
