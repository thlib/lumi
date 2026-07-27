import assert from 'node:assert/strict'
import test from 'node:test'

import {overviewDetails} from '../examples/spa/data.js'

test('overview details follow the local date and time of day', () => {
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
