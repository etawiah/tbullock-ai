// In-memory stand-in for a Cloudflare KV namespace (only the methods the Worker uses).
export function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  const failGets = new Set()
  return {
    store,
    failGets,
    async get(key, opts) {
      if (failGets.has(key)) throw new Error('KV transient failure')
      const v = store.get(key)
      if (v === undefined) return null
      const type = typeof opts === 'string' ? opts : opts?.type
      return type === 'json' ? JSON.parse(v) : v
    },
    async put(key, value) { store.set(key, String(value)) },
    async delete(key) { store.delete(key) },
    async list({ prefix = '' } = {}) {
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name }))
      return { keys, list_complete: true }
    },
    json(key) { const v = store.get(key); return v === undefined ? undefined : JSON.parse(v) }
  }
}
