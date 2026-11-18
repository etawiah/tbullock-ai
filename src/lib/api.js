// Small helpers for talking to the Worker API. Plain JS (no JSX, no import.meta)
// so they can be unit-tested with `node --test`.

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// GET/POST JSON. Throws ApiError for network failures, non-2xx responses, and
// responses that are not JSON (e.g. a Cloudflare Access login page).
export async function requestJson(fetchFn, url, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetchFn(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch (error) {
    throw new ApiError(`Network error: ${error.message}`, 0)
  }
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(`Unexpected response (${response.status})`, response.status, text.slice(0, 200))
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data)
  }
  return data
}

// Load one stored list (inventory, recipes, shopping, chatHistory).
// Only when the server *successfully* says the list is empty do we fall back to
// the bundled starter data, and only then do we save it. Any failure throws, so
// callers never mistake "couldn't load" for "empty" and overwrite real data.
export async function loadList(fetchFn, { base, path, field, seedUrl }) {
  const data = await requestJson(fetchFn, `${base}/${path}`)
  const items = data?.[field]
  if (!Array.isArray(items)) {
    throw new ApiError(`Unexpected ${path} response`, 200, data)
  }
  const rev = Number.isInteger(data.rev) ? data.rev : null
  // Seed only on first run: the list is empty AND the server says it was never
  // saved. A list the user emptied on purpose (stored: true) stays empty.
  if (items.length > 0 || !seedUrl || data.stored === true) {
    return { items, rev, seeded: false }
  }
  let seed
  try {
    seed = await requestJson(fetchFn, seedUrl)
  } catch {
    return { items, rev, seeded: false }
  }
  if (!Array.isArray(seed) || seed.length === 0) {
    return { items, rev, seeded: false }
  }
  let savedRev = rev
  try {
    const saved = await requestJson(fetchFn, `${base}/${path}`, { method: 'POST', body: { [field]: seed, ...(rev !== null ? { rev } : {}) } })
    if (Number.isInteger(saved?.rev)) savedRev = saved.rev
  } catch {
    // Starter data still shown; it will be saved with the next change.
  }
  return { items: seed, rev: savedRev, seeded: true }
}
