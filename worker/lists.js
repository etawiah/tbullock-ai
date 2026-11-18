// Storage helpers for the app's lists (inventory, recipes, shopping, chat history).
//
// Revisions: each list has a companion integer at `rev:<key>`. A save that sends
// the revision it loaded is rejected (409) if someone else saved in between, so
// two phones can't silently overwrite each other. Saves without a revision
// (older app builds) are still accepted.

export const revKey = (key) => `rev:${key}`

export async function readRev(kv, key) {
  const raw = await kv.get(revKey(key))
  const n = parseInt(raw, 10)
  return Number.isInteger(n) && n >= 0 ? n : 0
}

export async function readList(kv, key) {
  const stored = await kv.get(key, { type: 'json' })
  return { items: Array.isArray(stored) ? stored : [], stored: stored !== null }
}

// Returns { status: 'saved', rev } | { status: 'conflict', rev, items } | { status: 'invalid' }.
export async function saveList(kv, key, items, clientRev) {
  if (!Array.isArray(items)) return { status: 'invalid' }
  const currentRev = await readRev(kv, key)
  if (Number.isInteger(clientRev) && clientRev !== currentRev) {
    const { items: current } = await readList(kv, key)
    return { status: 'conflict', rev: currentRev, items: current }
  }
  await kv.put(key, JSON.stringify(items))
  const rev = currentRev + 1
  await kv.put(revKey(key), String(rev))
  return { status: 'saved', rev }
}
