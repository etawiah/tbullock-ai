// Shopping-list helpers (pure, unit-tested).

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const norm = (value) => String(value || '').toLowerCase().trim()

// Low stock = under 120 ml (about 4 oz) or under 25% of the bottle.
export function isLowStock(item) {
  const current = parseFloat(item?.amountRemaining) || 0
  const total = parseFloat(item?.bottleSizeMl) || 0
  if (current < 120) return true
  return total > 0 && (current / total) * 100 < 25
}

// Should this shopping-list entry be cleared because the inventory now covers it?
// - Entries added from a low bottle ('low-stock') clear once that bottle is restocked.
// - Other entries (missing recipe ingredients, manual) clear once a matching bottle exists.
export function isCoveredByInventory(shopItem, inventory) {
  const shopName = norm(shopItem?.name)
  if (!shopName) return false

  if (shopItem.source === 'low-stock') {
    const bottle = inventory.find(inv => norm(inv.name) === shopName && norm(inv.brand) === norm(shopItem.brand))
    return Boolean(bottle) && !isLowStock(bottle)
  }

  const wordPattern = shopName.length >= 4 ? new RegExp(`\\b${escapeRegExp(shopName)}\\b`) : null
  return inventory.some(inv => {
    const invName = norm(inv.name)
    const invType = norm(inv.type)
    if (invName === shopName || invType === shopName) return true
    // Whole-word match, at least 4 characters so "gin" doesn't match "ginger".
    return Boolean(wordPattern) && (wordPattern.test(invName) || wordPattern.test(invType))
  })
}
