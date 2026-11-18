import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'

const item = { id: 'menu-1', favoriteId: 1, name: 'Negroni', description: 'gin', primarySpirit: 'gin', status: 'active' }

test('version history shows the publish date', async () => {
  const env = { BARTENDER_KV: makeKV({ recipes: [{ id: 1 }] }) }
  await call(env, 'POST', '/api/menu/publish', { items: [item], version: 0 })
  const res = await call(env, 'GET', '/api/menu/snapshots')
  assert.equal(res.body.snapshots.length, 1)
  assert.ok(!Number.isNaN(Date.parse(res.body.snapshots[0].updatedAt)))
})

test('discarding a draft deletes it on the server', async () => {
  const env = { BARTENDER_KV: makeKV() }
  await call(env, 'POST', '/api/menu/draft', { items: [item] })
  assert.ok(env.BARTENDER_KV.json('menu:draft'))
  const res = await call(env, 'DELETE', '/api/menu/draft')
  assert.equal(res.status, 200)
  assert.equal(env.BARTENDER_KV.json('menu:draft'), undefined)
  assert.equal((await call(env, 'GET', '/api/menu/admin')).body.source, 'empty')
})

test('publishing from a stale version is rejected', async () => {
  const env = { BARTENDER_KV: makeKV({ recipes: [{ id: 1 }] }) }
  await call(env, 'POST', '/api/menu/publish', { items: [item], version: 0 })
  await call(env, 'POST', '/api/menu/publish', { items: [], version: 1 })
  const stale = await call(env, 'POST', '/api/menu/publish', { items: [item], version: 1 })
  assert.equal(stale.status, 409)
})

test('an empty menu can be published', async () => {
  const env = { BARTENDER_KV: makeKV({ recipes: [{ id: 1 }] }) }
  await call(env, 'POST', '/api/menu/publish', { items: [item], version: 0 })
  const res = await call(env, 'POST', '/api/menu/publish', { items: [], version: 1 })
  assert.equal(res.status, 200)
  assert.deepEqual((await call(env, 'GET', '/api/menu')).body.items, [])
})
