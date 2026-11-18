import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeChanges, recipeKey, shoppingKey } from '../src/lib/mergeChanges.js'

test('my add + her add both survive', () => {
  const prev = [{ id: 1, name: 'Negroni' }]
  const mine = [...prev, { id: 2, name: 'Daiquiri' }]
  const hers = [...prev, { id: 3, name: 'Paloma' }]
  assert.deepEqual(mergeChanges(prev, mine, hers, recipeKey).map(r => r.id), [1, 3, 2])
})

test('my delete and edit apply on top of her list', () => {
  const prev = [{ id: 1, name: 'Negroni' }, { id: 2, name: 'Daiquiri' }]
  const mine = [{ id: 2, name: 'Daiquiri (frozen)' }]
  const hers = [...prev, { id: 3, name: 'Paloma' }]
  assert.deepEqual(mergeChanges(prev, mine, hers, recipeKey), [{ id: 2, name: 'Daiquiri (frozen)' }, { id: 3, name: 'Paloma' }])
})

test('shopping items match by name+brand, case-insensitive', () => {
  const prev = [{ name: 'Limes', brand: '' }]
  const mine = []
  const hers = [{ name: 'limes', brand: '' }, { name: 'Mint', brand: '' }]
  assert.deepEqual(mergeChanges(prev, mine, hers, shoppingKey), [{ name: 'Mint', brand: '' }])
})
