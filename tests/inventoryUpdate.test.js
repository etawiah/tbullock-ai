import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInventoryUpdate, applyInventoryUpdates, findBottle } from '../worker/inventoryUpdate.js'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'
import { installFakeAI } from './helpers/fake-ai.js'

const reply = `Used: 2 shots Tito's

[INVENTORY_UPDATE]{
  "updates": [
    { "bottleName": "Tito's Vodka", "mlSubtracted": 90 },
    { "bottleName": "Orange Juice", "mlSubtracted": 120 }
  ]
}

Inventory updated! What's next?`

test('parses the nested JSON block with the field names the prompt asks for', () => {
  const r = parseInventoryUpdate(reply)
  assert.equal(r.found, true)
  assert.deepEqual(r.updates, [{ name: "Tito's Vodka", ml: 90 }, { name: 'Orange Juice', ml: 120 }])
  assert.ok(!r.text.includes('[INVENTORY_UPDATE]'))
  assert.ok(!r.text.includes('mlSubtracted'))
  assert.ok(r.text.includes("What's next?"))
})

test('also accepts legacy name/subtract fields and code fences', () => {
  const r = parseInventoryUpdate('Done.\n```json\n[INVENTORY_UPDATE]{"updates":[{"name":"Gin","subtract":"45 ml"}]}\n```\nCheers')
  assert.deepEqual(r.updates, [{ name: 'Gin', ml: 45 }])
  assert.equal(r.text, 'Done.\n\nCheers')
})

test('an unreadable block is reported, not silently ignored', () => {
  const r = parseInventoryUpdate('Ok [INVENTORY_UPDATE]{"updates": [ {"bottleName": "Gin" ')
  assert.equal(r.found, true)
  assert.equal(r.updates, null)
  assert.equal(r.text, 'Ok')
})

test('applies to exact, brand+name and partial matches; reports unmatched', () => {
  const inv = [
    { name: "Tito's Vodka", amountRemaining: '700' },
    { brand: 'Glenlivet', name: '12 Year', amountRemaining: '500' },
    { name: 'Fresh Orange Juice', amountRemaining: '1000' }
  ]
  assert.equal(findBottle(inv, 'glenlivet 12 year'), 1)
  const r = applyInventoryUpdates(inv, [{ name: "tito's vodka", ml: 90 }, { name: 'Orange Juice', ml: 120 }, { name: 'Campari', ml: 30 }])
  assert.equal(r.inventory[0].amountRemaining, '610')
  assert.equal(r.inventory[2].amountRemaining, '880')
  assert.deepEqual(r.unmatched, ['Campari'])
  assert.equal(inv[0].amountRemaining, '700')
})

test('chat endpoint applies the update to stored inventory and tells the user', async () => {
  const ai = installFakeAI()
  ai.reply = reply
  try {
    const kv = makeKV({ inventory: [{ name: "Tito's Vodka", amountRemaining: '700' }, { name: 'Orange Juice', amountRemaining: '900' }] })
    // the phone sends a stale copy; the stored one must be used
    const res = await call({ BARTENDER_KV: kv, GEMINI_API_KEY: 'k' }, 'POST', '/api/chat', {
      message: 'I had two shots of Titos with OJ', chatHistory: [],
      inventory: [{ name: "Tito's Vodka", amountRemaining: '999' }]
    })
    assert.equal(res.status, 200)
    assert.equal(kv.json('inventory')[0].amountRemaining, '610')
    assert.equal(kv.json('inventory')[1].amountRemaining, '780')
    assert.ok(!res.body.response.includes('[INVENTORY_UPDATE]'))
    assert.match(res.body.response, /Inventory updated: Tito's Vodka −90 ml \(610 ml left\)/)
    assert.equal(res.body.updatedInventory.length, 2)
  } finally {
    ai.restore()
  }
})

test('the AI sees one inventory line per bottle (real newlines, not "\\n")', async () => {
  const ai = installFakeAI()
  try {
    await call({ BARTENDER_KV: makeKV(), GEMINI_API_KEY: 'k' }, 'POST', '/api/chat', {
      message: 'hi', chatHistory: [], inventory: [{ type: 'Gin', name: 'A' }, { type: 'Rum', name: 'B' }]
    })
    const payload = JSON.stringify(ai.calls[0].body)
    assert.ok(!payload.includes('\\\\n- '), 'literal backslash-n found in prompt')
    assert.ok(payload.includes('Gin: A') && payload.includes('\\n- Rum: B'))
  } finally {
    ai.restore()
  }
})
