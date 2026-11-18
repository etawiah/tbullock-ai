import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'

const env = () => ({ BARTENDER_KV: makeKV({ inventory: [{ name: 'Gin' }] }) })

test('private routes do not allow arbitrary origins (no wildcard CORS)', async () => {
  const res = await call(env(), 'GET', '/api/inventory', undefined, { Origin: 'https://evil.example' })
  assert.equal(res.headers.get('access-control-allow-origin'), null)
})

test('the app origins are allowed', async () => {
  for (const origin of ['https://bartender.tawiah.net', 'http://localhost:5173', 'https://abc123.ai-bartender.pages.dev']) {
    const res = await call(env(), 'POST', '/api/inventory', { inventory: [] }, { Origin: origin })
    assert.equal(res.headers.get('access-control-allow-origin'), origin)
  }
})

test('the public guest menu stays readable from anywhere', async () => {
  const res = await call(env(), 'GET', '/api/menu', undefined, { Origin: 'https://someone-else.example' })
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
})

test('wrangler.toml keeps workers.dev and preview URLs off and has no routes', () => {
  const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const active = toml.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
  assert.match(active, /^workers_dev = false$/m)
  assert.match(active, /^preview_urls = false$/m)
  assert.doesNotMatch(active, /^\s*routes?\s*=/m)
})
