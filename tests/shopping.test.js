import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCoveredByInventory, isLowStock } from '../src/lib/shopping.js'

const inventory = [
  { name: 'Grey Goose Vodka', type: 'Vodka', bottleSizeMl: '750', amountRemaining: '600' },
  { name: 'Ginger Beer', type: 'Mixer', bottleSizeMl: '1000', amountRemaining: '900' },
  { name: 'Campari', type: 'Aperitif', bottleSizeMl: '750', amountRemaining: '60' }
]

test('names with regex characters do not throw', () => {
  for (const name of ['Lime juice (fresh', 'C++ syrup', '[sweet] vermouth', 'what?']) {
    assert.doesNotThrow(() => isCoveredByInventory({ name }, inventory))
  }
})

test('generic and whole-word matches clear an entry; short words do not over-match', () => {
  assert.equal(isCoveredByInventory({ name: 'vodka' }, inventory), true)
  assert.equal(isCoveredByInventory({ name: 'Grey Goose Vodka' }, inventory), true)
  assert.equal(isCoveredByInventory({ name: 'gin' }, inventory), false)
  assert.equal(isCoveredByInventory({ name: 'Elderflower Liqueur' }, inventory), false)
})

test('an entry added from a low bottle stays until that bottle is restocked', () => {
  const entry = { name: 'Campari', brand: '', source: 'low-stock' }
  assert.equal(isLowStock(inventory[2]), true)
  assert.equal(isCoveredByInventory(entry, inventory), false)
  const restocked = inventory.map(i => (i.name === 'Campari' ? { ...i, amountRemaining: '750' } : i))
  assert.equal(isCoveredByInventory(entry, restocked), true)
})
