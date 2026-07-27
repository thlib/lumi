import assert from 'node:assert/strict'
import test from 'node:test'

import content from '../examples/spa/data-content.json' with {type: 'json'}
import records from '../examples/spa/data-records.json' with {type: 'json'}
import {overviewDetails} from '../examples/spa/lumi-native/demo-app.js'

test('the SPAs share their static content and record configuration', () => {
  assert.equal(content.projects.length, 4)
  assert.equal(content.members.length, 11)
  assert.equal(records.recordCount, 20_000)
  assert.deepEqual(records.recordFilters, ['all', 'alpha', 'beta', 'gamma', 'delta'])
})

test('overview details follow the local date and time of day', () => {
  /** @param {number} hour */
  const at = hour => overviewDetails(new Date(2026, 6, 24, hour))

  assert.deepEqual(
    [at(0).title, at(11).title, at(12).title, at(17).title, at(18).title],
    [
      'Good morning, Freddy',
      'Good morning, Freddy',
      'Good afternoon, Freddy',
      'Good afternoon, Freddy',
      'Good evening, Freddy',
    ],
  )
  assert.equal(at(12).date, 'Friday, July 24')
  assert.equal(at(12).today, 'Fri')
})
