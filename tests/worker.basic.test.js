import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'

test('inventory round-trips through KV', async () => {
  const env = { BARTENDER_KV: makeKV() }
  const save = await call(env, 'POST', '/api/inventory', { inventory: [{ name: 'Gin', amountRemaining: '500' }] })
  assert.equal(save.status, 200)
  const load = await call(env, 'GET', '/api/inventory')
  assert.deepEqual(load.body.inventory, [{ name: 'Gin', amountRemaining: '500' }])
})

test('unknown route is 404', async () => {
  const env = { BARTENDER_KV: makeKV() }
  const res = await call(env, 'GET', '/api/nope')
  assert.equal(res.status, 404)
})
