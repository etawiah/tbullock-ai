import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'

for (const [path, field] of [['inventory', 'inventory'], ['recipes', 'recipes'], ['shopping', 'shopping']]) {
  test(`${path}: stale save from a second phone gets 409 with current data`, async () => {
    const env = { BARTENDER_KV: makeKV({ [path]: [{ name: 'A' }] }) }
    const phoneA = await call(env, 'GET', `/api/${path}`)
    const phoneB = await call(env, 'GET', `/api/${path}`)
    assert.equal(phoneA.body.rev, 0)

    const saveA = await call(env, 'POST', `/api/${path}`, { [field]: [{ name: 'A' }, { name: 'B' }], rev: phoneA.body.rev })
    assert.equal(saveA.status, 200)
    assert.equal(saveA.body.rev, 1)

    const saveB = await call(env, 'POST', `/api/${path}`, { [field]: [{ name: 'A' }, { name: 'C' }], rev: phoneB.body.rev })
    assert.equal(saveB.status, 409)
    assert.equal(saveB.body.rev, 1)
    assert.deepEqual(saveB.body[field], [{ name: 'A' }, { name: 'B' }])
    assert.deepEqual(env.BARTENDER_KV.json(path), [{ name: 'A' }, { name: 'B' }])
  })
}

test('saves without a revision (older app builds) are still accepted', async () => {
  const env = { BARTENDER_KV: makeKV({ inventory: [] }) }
  const res = await call(env, 'POST', '/api/inventory', { inventory: [{ name: 'Gin' }] })
  assert.equal(res.status, 200)
  assert.equal(res.body.rev, 1)
})

test('non-array payloads are rejected and nothing is written', async () => {
  const env = { BARTENDER_KV: makeKV({ inventory: [{ name: 'Gin' }] }) }
  for (const body of [{}, { inventory: 'oops' }, { inventory: { a: 1 } }]) {
    const res = await call(env, 'POST', '/api/inventory', body)
    assert.equal(res.status, 400)
  }
  assert.deepEqual(env.BARTENDER_KV.json('inventory'), [{ name: 'Gin' }])
})
