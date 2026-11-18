// Parsing and applying the [INVENTORY_UPDATE]{...} block the chat AI emits
// when the user says what they poured. Pure functions, unit-tested.

export const UPDATE_MARKER = '[INVENTORY_UPDATE]'

// Find the end of the JSON object that starts at `start` (a '{'), honouring strings.
function findObjectEnd(text, start) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

const toNumber = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

// Returns { found, updates: [{ name, ml }], text } where text has the block removed.
// found=true with updates=null means the block was present but unreadable.
export function parseInventoryUpdate(response) {
  const markerIndex = response.indexOf(UPDATE_MARKER)
  if (markerIndex === -1) return { found: false, updates: [], text: response }

  const braceIndex = response.indexOf('{', markerIndex + UPDATE_MARKER.length)
  const end = braceIndex === -1 ? -1 : findObjectEnd(response, braceIndex)
  if (end === -1) {
    return { found: true, updates: null, text: response.slice(0, markerIndex).trim() }
  }

  // Also swallow a code fence the model may have wrapped around the block.
  let before = response.slice(0, markerIndex).replace(/```(?:json)?\s*$/i, '')
  let after = response.slice(end).replace(/^\s*```/, '')
  const text = `${before.trimEnd()}\n\n${after.trimStart()}`.trim()

  let data
  try {
    data = JSON.parse(response.slice(braceIndex, end))
  } catch {
    return { found: true, updates: null, text }
  }
  const rawUpdates = Array.isArray(data?.updates) ? data.updates : []
  const updates = rawUpdates
    .map(u => ({
      name: String(u?.bottleName ?? u?.name ?? u?.bottle ?? '').trim(),
      ml: toNumber(u?.mlSubtracted ?? u?.subtract ?? u?.ml ?? u?.amountMl)
    }))
    .filter(u => u.name && u.ml > 0)
  return { found: true, updates, text }
}

const norm = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Pick the bottle an update refers to: exact name, then brand + name, then a
// unique partial match (ties go to the bottle with the most left).
export function findBottle(inventory, name) {
  const target = norm(name)
  if (!target) return -1
  const exact = inventory.findIndex(item => norm(item.name) === target)
  if (exact !== -1) return exact
  const branded = inventory.findIndex(item => item.brand && norm(`${item.brand} ${item.name}`) === target)
  if (branded !== -1) return branded
  const partial = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const itemName = norm(item.name)
      return itemName && (itemName.includes(target) || target.includes(itemName))
    })
  if (partial.length === 0) return -1
  partial.sort((a, b) => (parseFloat(b.item.amountRemaining) || 0) - (parseFloat(a.item.amountRemaining) || 0))
  return partial[0].index
}

// Returns { inventory, applied: [{ name, ml, before, after }], unmatched: [name] }.
export function applyInventoryUpdates(inventory, updates) {
  const next = [...inventory]
  const applied = []
  const unmatched = []
  for (const { name, ml } of updates) {
    const index = findBottle(next, name)
    if (index === -1) {
      unmatched.push(name)
      continue
    }
    const before = parseFloat(next[index].amountRemaining) || 0
    const after = Math.round(Math.max(0, before - ml) * 10) / 10
    next[index] = { ...next[index], amountRemaining: String(after) }
    applied.push({ name: next[index].name, ml, before, after })
  }
  return { inventory: next, applied, unmatched }
}

// Plain-language summary appended to the chat reply so it states what really changed.
export function describeUpdate({ applied, unmatched }, parseFailed = false) {
  if (parseFailed) {
    return "⚠️ I couldn't update your inventory automatically. You can adjust it on the Inventory tab."
  }
  const lines = []
  if (applied.length > 0) {
    lines.push('✅ Inventory updated: ' + applied.map(a => `${a.name} −${Math.round(a.ml)} ml (${Math.round(a.after)} ml left)`).join('; ') + '.')
  }
  if (unmatched.length > 0) {
    lines.push(`⚠️ Not in your inventory, so nothing changed for: ${unmatched.join(', ')}.`)
  }
  return lines.join('\n')
}
