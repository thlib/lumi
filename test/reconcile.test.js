// @ts-check

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  longestIncreasingSubsequencePositions,
} from '../src/reconcile.js'

test('finds a longest stable subsequence while ignoring new items', () => {
  const cases = [
    { values: [], expectedLength: 0 },
    { values: [0, 0], expectedLength: 0 },
    { values: [1, 2, 3], expectedLength: 3 },
    { values: [3, 4, 5, 1, 2], expectedLength: 3 },
    { values: [5, 4, 3, 2, 1], expectedLength: 1 },
    { values: [0, 3, 4, 0, 1, 2], expectedLength: 2 },
    { values: [1, 3, 2, 4], expectedLength: 3 },
  ]

  for (const { values, expectedLength } of cases) {
    const positions = longestIncreasingSubsequencePositions(values)
    const sortedPositions = Array.from(positions).sort((left, right) => {
      return left - right
    })
    let previousValue = 0

    assert.equal(positions.size, expectedLength)

    for (const position of sortedPositions) {
      const value = values[position]

      assert.notEqual(value, undefined)

      if (value === undefined) {
        throw new Error('Stable subsequence referenced a missing value')
      }

      assert.ok(value > previousValue)
      previousValue = value
    }
  }
})
