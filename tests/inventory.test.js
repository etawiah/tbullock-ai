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

test('toMl uses one consistent conversion for every unit', async () => {
  const { toMl } = await import('../src/lib/inventory.js')
  assert.equal(Math.round(toMl('1.5', 'oz') * 10) / 10, 44.4)
  assert.equal(toMl(2, 'ml'), 2)
  assert.equal(Math.round(toMl(1, 'tsp') * 100) / 100, 4.93)
  assert.equal(Math.round(toMl(2, 'dash') * 100) / 100, 1.84)
  assert.equal(toMl('abc', 'oz'), 0)
  assert.equal(toMl(5, 'unknown'), 5)
})

test('undo adds back exactly what a pour removed', async () => {
  const { pouredAmounts, addBack, subtractPours } = await import('../src/lib/inventory.js')
  const before = [{ name: 'Gin', amountRemaining: '500' }, { name: 'Vodka', amountRemaining: '20' }]
  const after = subtractPours(before, [{ name: 'Gin', subtract: 45 }, { name: 'Vodka', subtract: 45 }])
  const poured = pouredAmounts(before, after)
  assert.deepEqual(poured, [{ name: 'Gin', ml: 45 }, { name: 'Vodka', ml: 20 }])
  const undone = addBack(after, poured)
  assert.deepEqual(undone.map(i => i.amountRemaining), ['500', '20'])
})
