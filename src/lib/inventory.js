// Pure inventory helpers (no React) so they can be unit-tested.

export const ML_PER_OZ = 29.5735

// Millilitres per recipe unit. A dash is ~1/32 oz; a bar spoon ~5 ml.
const ML_PER_UNIT = {
  ml: 1,
  oz: ML_PER_OZ,
  cl: 10,
  tsp: 4.93,
  tbsp: 14.79,
  barspoon: 5,
  dash: 0.92
}

// Convert a recipe amount to ml. Unknown units are treated as ml; bad amounts as 0.
export function toMl(amount, unit = 'ml') {
  const n = parseFloat(amount)
  if (!Number.isFinite(n) || n < 0) return 0
  return n * (ML_PER_UNIT[String(unit).toLowerCase().trim()] ?? 1)
}

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

// Amounts poured by a change: compares the same positions before/after.
export function pouredAmounts(before, after) {
  const poured = []
  after.forEach((item, i) => {
    const prev = before[i]
    if (!prev || prev.name !== item.name) return
    const ml = (parseFloat(prev.amountRemaining) || 0) - (parseFloat(item.amountRemaining) || 0)
    if (ml > 0) poured.push({ name: item.name, ml })
  })
  return poured
}

// Undo a pour by adding the amounts back (works even after the other phone saved).
export function addBack(inventory, poured) {
  const next = [...inventory]
  poured.forEach(({ name, ml }) => {
    const idx = next.findIndex(item => item.name === name)
    if (idx === -1) return
    const current = parseFloat(next[idx].amountRemaining) || 0
    next[idx] = { ...next[idx], amountRemaining: String(roundMl(current + ml)) }
  })
  return next
}
