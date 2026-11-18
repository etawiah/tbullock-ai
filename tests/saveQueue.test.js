import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSaveQueue } from '../src/lib/saveQueue.js'

const tick = (ms = 5) => new Promise(r => setTimeout(r, ms))

test('a save requested while one is running is not dropped; latest value wins', async () => {
  let value = 1
  const saved = []
  const q = createSaveQueue({ getValue: () => value, save: async v => { await tick(); saved.push(v) } })
  const first = q.request()
  value = 2; q.request()
  value = 3; const last = q.request()
  await first; await last
  assert.deepEqual(saved, [1, 3])
})

test('reports saving/saved/error status', async () => {
  const statuses = []
  let fail = true
  const q = createSaveQueue({ getValue: () => 0, save: async () => { if (fail) throw new Error('boom') }, onStatus: s => statuses.push(s) })
  await q.request().catch(() => {})
  fail = false
  await q.request()
  assert.deepEqual(statuses, ['saving', 'error', 'saving', 'saved'])
})
