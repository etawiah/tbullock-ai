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

export const BACKUP_DAYS = 14
const today = (now) => new Date(now).toISOString().slice(0, 10)

// Before the first write of each (UTC) day, copy the current stored value to
// backup:<key>:<YYYY-MM-DD>, then keep only the newest BACKUP_DAYS copies.
// Costs at most one extra write per list per day.
export async function backupBeforeWrite(kv, key, now = Date.now()) {
  const backupKey = `backup:${key}:${today(now)}`
  if (await kv.get(backupKey) !== null) return
  const current = await kv.get(key)
  if (current === null) return
  await kv.put(backupKey, current)
  const { keys } = await kv.list({ prefix: `backup:${key}:` })
  const names = keys.map(k => k.name).sort()
  for (const old of names.slice(0, Math.max(0, names.length - BACKUP_DAYS))) {
    await kv.delete(old)
  }
}

// Returns { status: 'saved', rev } | { status: 'conflict', rev, items } | { status: 'invalid' }.
export async function saveList(kv, key, items, clientRev) {
  if (!Array.isArray(items)) return { status: 'invalid' }
  const currentRev = await readRev(kv, key)
  if (Number.isInteger(clientRev) && clientRev !== currentRev) {
    const { items: current } = await readList(kv, key)
    return { status: 'conflict', rev: currentRev, items: current }
  }
  try {
    await backupBeforeWrite(kv, key)
  } catch (error) {
    console.error(`Backup of ${key} failed (saving anyway):`, error)
  }
  await kv.put(key, JSON.stringify(items))
  const rev = currentRev + 1
  await kv.put(revKey(key), String(rev))
  return { status: 'saved', rev }
}
