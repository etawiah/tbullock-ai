import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createListSync } from '../src/lib/listSync.js'
import { requestJson } from '../src/lib/api.js'
import { makeKV } from './helpers/fake-kv.js'
import worker from '../worker/worker.js'

// A "phone": local state + sync helper talking to the real Worker.
async function phone(env) {
  const fetchFn = (url, init) => worker.fetch(new Request(`https://x${url}`, init), env)
  const loaded = await requestJson(fetchFn, '/api/inventory')
  let value = loaded.inventory
  const sync = createListSync({
    post: (items, rev) => requestJson(fetchFn, '/api/inventory', { method: 'POST', body: { inventory: items, rev } }),
    getValue: () => value,
    setValue: v => { value = v },
    extract: body => body.inventory
  })
  sync.reset(loaded.rev)
  return {
    get value() { return value },
    change(fn, opts) { value = fn(value); sync.record(fn, opts) },
    save: () => sync.save(),
    sync
  }
}

const add = name => inv => [...inv, { name }]

test('two phones adding bottles: both bottles survive', async () => {
  const env = { BARTENDER_KV: makeKV({ inventory: [{ name: 'Gin' }] }) }
  const wife = await phone(env)
  const me = await phone(env)
  wife.change(add('Rum')); await wife.save()
  me.change(add('Tequila')); await me.save()
  assert.deepEqual(env.BARTENDER_KV.json('inventory').map(i => i.name), ['Gin', 'Rum', 'Tequila'])
  assert.deepEqual(me.value.map(i => i.name), ['Gin', 'Rum', 'Tequila'])
})

test('a whole-list replace asks before overwriting the other phone', async () => {
  const env = { BARTENDER_KV: makeKV({ inventory: [{ name: 'Gin' }] }) }
  const fetchFn = (u, i) => worker.fetch(new Request(`https://x${u}`, i), env)
  const wife = await phone(env)
  wife.change(add('Rum')); await wife.save()

  // My phone loaded at rev 0, then did an Edit-mode style whole-list save.
  let mine = [{ name: 'Only Mine' }]
  let asked = 0
  const sync = createListSync({
    post: (items, rev) => requestJson(fetchFn, '/api/inventory', { method: 'POST', body: { inventory: items, rev } }),
    getValue: () => mine,
    setValue: v => { mine = v },
    extract: b => b.inventory,
    confirmOverwrite: () => { asked++; return false }
  })
  sync.reset(0)
  sync.record(() => [{ name: 'Only Mine' }], { replace: true })
  const result = await sync.save()
  assert.equal(result.status, 'discarded')
  assert.equal(asked, 1)
  assert.deepEqual(mine.map(i => i.name), ['Gin', 'Rum'])
  assert.deepEqual(env.BARTENDER_KV.json('inventory').map(i => i.name), ['Gin', 'Rum'])
})

test('non-conflict errors are rethrown', async () => {
  const sync = createListSync({ post: async () => { const e = new Error('offline'); e.status = 0; throw e }, getValue: () => [], setValue: () => {}, extract: b => b })
  await assert.rejects(sync.save(), /offline/)
})
