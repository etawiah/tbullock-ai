import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeKV } from './helpers/fake-kv.js'
import { call } from './helpers/worker-client.js'
import { installFakeAI } from './helpers/fake-ai.js'

test('Gemini gets a systemInstruction and an alternating conversation starting with the user', async () => {
  const ai = installFakeAI()
  try {
    await call({ BARTENDER_KV: makeKV(), GEMINI_API_KEY: 'k' }, 'POST', '/api/chat', {
      message: 'And a daiquiri?',
      inventory: [],
      chatHistory: [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Negroni please' },
        { role: 'user', content: 'with Campari' },
        { role: 'assistant', content: 'Drink: Negroni' },
        { role: 'assistant', content: '' }
      ]
    })
    const body = ai.calls[0].body
    assert.match(body.systemInstruction.parts[0].text, /bartender AI assistant/)
    const roles = body.contents.map(c => c.role)
    assert.deepEqual(roles, ['user', 'model', 'user'])
    assert.equal(body.contents[0].parts[0].text, 'Negroni please\n\nwith Campari')
  } finally {
    ai.restore()
  }
})

test('stored chat history is capped at 200 messages', async () => {
  const kv = makeKV()
  const long = Array.from({ length: 250 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
  await call({ BARTENDER_KV: kv }, 'POST', '/api/chat-history', { chatHistory: long })
  const stored = kv.json('chatHistory')
  assert.equal(stored.length, 200)
  assert.equal(stored.at(-1).content, 'm249')
})
