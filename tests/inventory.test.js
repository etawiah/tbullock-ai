import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractPours, subtractAt, ML_PER_OZ } from '../src/lib/inventory.js'

const inv = () => [
  { name: 'Gin', amountRemaining: '500' },
  { name: 'Vodka', amountRemaining: '30' },
  { name: 'Rum', amountRemaining: 'In Stock' }
]

test('subtractPours subtracts by name, rounds, never negative, does not mutate', () => {
  const original = inv()
  const next = subtractPours(original, [{ name: 'Gin', subtract: 45.5 }, { name: 'Vodka', subtract: 90 }, { name: 'Missing', subtract: 10 }])
  assert.equal(next[0].amountRemaining, '454.5')
  assert.equal(next[1].amountRemaining, '0')
  assert.equal(original[0].amountRemaining, '500')
  assert.equal(next[2], original[2])
})

test('subtractAt removes one shot (1.5 oz) from the chosen bottle only', () => {
  const next = subtractAt(inv(), 0, 1.5 * ML_PER_OZ)
  assert.equal(next[0].amountRemaining, '455.6')
  assert.equal(next[1].amountRemaining, '30')
})
