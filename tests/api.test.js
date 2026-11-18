import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadList, requestJson, ApiError } from '../src/lib/api.js'
import { makeKV } from './helpers/fake-kv.js'
import worker from '../worker/worker.js'

// fetch that routes /api/* to the real Worker and /initial-*.json to fixtures
function makeFetch(env, seedFiles = {}) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body })
    if (url.startsWith('/api/')) {
      return worker.fetch(new Request(`https://x${url}`, init), env)
    }
    if (url in seedFiles) return new Response(JSON.stringify(seedFiles[url]), { status: 200 })
    return new Response('not found', { status: 404 })
  }
  fn.calls = calls
  return fn
}

const opts = { base: '/api', path: 'inventory', field: 'inventory', seedUrl: '/initial-inventory.json' }
const seed = { '/initial-inventory.json': [{ name: 'Demo Vodka' }] }

test('loads existing items without seeding', async () => {
  const env = { BARTENDER_KV: makeKV({ inventory: [{ name: 'Real Gin' }] }) }
  const fetchFn = makeFetch(env, seed)
  const result = await loadList(fetchFn, opts)
  assert.deepEqual(result.items, [{ name: 'Real Gin' }])
  assert.equal(result.seeded, false)
  assert.ok(!fetchFn.calls.some(c => c.method === 'POST'))
})

test('seeds only when the server successfully returns an empty list', async () => {
  const env = { BARTENDER_KV: makeKV() }
  const result = await loadList(makeFetch(env, seed), opts)
  assert.equal(result.seeded, true)
  assert.deepEqual(env.BARTENDER_KV.json('inventory'), [{ name: 'Demo Vodka' }])
})

test('a failed load throws and never writes (no demo data over real data)', async () => {
  const kv = makeKV({ inventory: [{ name: 'Real Gin' }] })
  kv.failGets.add('inventory')
  const fetchFn = makeFetch({ BARTENDER_KV: kv }, seed)
  await assert.rejects(loadList(fetchFn, opts), ApiError)
  assert.deepEqual(kv.json('inventory'), [{ name: 'Real Gin' }])
  assert.ok(!fetchFn.calls.some(c => c.method === 'POST'))
})

test('a non-JSON response (e.g. Access login page) is an error, not an empty list', async () => {
  const fetchFn = async () => new Response('<html>login</html>', { status: 200 })
  await assert.rejects(requestJson(fetchFn, '/api/inventory'), /Unexpected response/)
})

test('network failure is an ApiError with status 0', async () => {
  const fetchFn = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(requestJson(fetchFn, '/api/x'), e => e instanceof ApiError && e.status === 0)
})

test('a list the user deliberately emptied is not re-seeded with demo data', async () => {
  const env = { BARTENDER_KV: makeKV({ inventory: [] }) }
  const fetchFn = makeFetch(env, seed)
  const result = await loadList(fetchFn, opts)
  assert.deepEqual(result.items, [])
  assert.equal(result.seeded, false)
  assert.deepEqual(env.BARTENDER_KV.json('inventory'), [])
})
