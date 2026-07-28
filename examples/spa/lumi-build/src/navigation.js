// @ts-check

import content from '../../data-content.json' with {type: 'json'}

/** @typedef {'overview' | 'projects' | 'records' | 'activity' | 'teams'} Route */

const fullDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const shortWeekday = new Intl.DateTimeFormat('en-US', {weekday: 'short'})

/**
 * Returns the date-sensitive copy used by the overview page.
 *
 * @param {Date} [now]
 */
export function overviewDetails(now = new Date()) {
  const hour = now.getHours()
  const dayPeriod = hour < 12
    ? 'morning'
    : hour < 18
      ? 'afternoon'
      : 'evening'

  return Object.freeze({
    title: `Good ${dayPeriod}, Freddy`,
    date: fullDate.format(now),
    today: shortWeekday.format(now),
  })
}

/**
 * @param {string} hash
 * @returns {Route}
 */
export function routeFromHash(hash) {
  const route = hash.replace(/^#\//, '').split(/[/?]/)[0]

  return route === 'overview'
    || route === 'projects'
    || route === 'records'
    || route === 'activity'
    || route === 'teams'
    ? route
    : 'overview'
}

/** @param {string} hash */
export function memberFromHash(hash) {
  const match = /^#\/teams\/([a-z0-9-]+)(?:[/?]|$)/.exec(hash)
  return match?.[1] ?? null
}

export function normalizeHash() {
  if (!/^#\/(overview|projects|records|activity|teams)(?:[/?]|$)/.test(window.location.hash)) {
    window.history.replaceState(null, '', '#/overview')
  }
}

/**
 * @param {Route} route
 * @param {string | null} memberId
 */
export function documentTitle(route, memberId) {
  const member = content.members.find(item => item.id === memberId)
  return (member?.name ?? content.routeLabels[route]) + ' · Luminate'
}
