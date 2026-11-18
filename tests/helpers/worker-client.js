import worker from '../../worker/worker.js'

// Calls the real Worker in-process. Returns { status, headers, body } with JSON parsed when possible.
export async function call(env, method, path, body, headers = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json', ...headers } }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
  const res = await worker.fetch(new Request(`https://bartender.tawiah.net${path}`, init), env)
  const text = await res.text()
  let parsed = text
  try { parsed = JSON.parse(text) } catch {}
  return { status: res.status, headers: res.headers, body: parsed }
}
