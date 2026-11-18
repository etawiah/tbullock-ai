// Pure inventory helpers (no React) so they can be unit-tested.

export const ML_PER_OZ = 29.5735

const roundMl = (ml) => Math.round(ml * 10) / 10

// Subtract ml from the first bottle with each given name. Never goes below 0.
// Returns a new array; untouched items keep their identity.
export function subtractPours(inventory, updates) {
  const next = [...inventory]
  updates.forEach(({ name, subtract }) => {
    const idx = next.findIndex(item => item.name === name)
    if (idx === -1) return
    const current = parseFloat(next[idx].amountRemaining) || 0
    next[idx] = { ...next[idx], amountRemaining: String(roundMl(Math.max(0, current - subtract))) }
  })
  return next
}

// Subtract ml from the bottle at a given index.
export function subtractAt(inventory, index, ml) {
  return inventory.map((item, i) => {
    if (i !== index) return item
    const current = parseFloat(item.amountRemaining) || 0
    return { ...item, amountRemaining: String(roundMl(Math.max(0, current - ml))) }
  })
}
