import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'
import { backupBeforeWrite, BACKUP_DAYS } from '../worker/lists.js'

const today = new Date().toISOString().slice(0, 10)

test('first save of the day keeps a copy of the previous version', async () => {
  const kv = makeKV({ inventory: [{ name: 'Yesterday Gin' }] })
  await call({ BARTENDER_KV: kv }, 'POST', '/api/inventory', { inventory: [{ name: 'Oops, wiped' }] })
  await call({ BARTENDER_KV: kv }, 'POST', '/api/inventory', { inventory: [{ name: 'Second save' }] })
  assert.deepEqual(kv.json(`backup:inventory:${today}`), [{ name: 'Yesterday Gin' }])
  assert.deepEqual(kv.json('inventory'), [{ name: 'Second save' }])
})

test('keeps only the newest 14 daily backups', async () => {
  const kv = makeKV({ recipes: [{ id: 1 }] })
  for (let d = 1; d <= 20; d++) {
    await backupBeforeWrite(kv, 'recipes', Date.UTC(2026, 0, d, 12))
  }
  const { keys } = await kv.list({ prefix: 'backup:recipes:' })
  assert.equal(keys.length, BACKUP_DAYS)
  assert.equal(keys[0].name, 'backup:recipes:2026-01-07')
  assert.equal(keys.at(-1).name, 'backup:recipes:2026-01-20')
})

test('chat history saves are backed up too, and validated', async () => {
  const kv = makeKV({ chatHistory: [{ role: 'user', content: 'hi' }] })
  assert.equal((await call({ BARTENDER_KV: kv }, 'POST', '/api/chat-history', { chatHistory: 'x' })).status, 400)
  await call({ BARTENDER_KV: kv }, 'POST', '/api/chat-history', { chatHistory: [] })
  assert.deepEqual(kv.json(`backup:chatHistory:${today}`), [{ role: 'user', content: 'hi' }])
})

test('export returns everything in one file', async () => {
  const kv = makeKV({ inventory: [{ name: 'Gin' }], recipes: [{ id: 1 }], 'menu:live': { items: [] } })
  const res = await call({ BARTENDER_KV: kv }, 'GET', '/api/export')
  assert.equal(res.body.format, 'tom-bullock-backup')
  assert.deepEqual(res.body.inventory, [{ name: 'Gin' }])
  assert.deepEqual(res.body.recipes, [{ id: 1 }])
  assert.deepEqual(res.body.shopping, [])
  assert.deepEqual(res.body.menu.live, { items: [] })
})
