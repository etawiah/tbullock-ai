// Apply the change that turned `prev` into `next` onto `server` (the other
// phone's newer copy), matching items by key. Used to merge favorites and the
// shopping list after a save conflict instead of overwriting.
export function mergeChanges(prev, next, server, keyFn) {
  const prevByKey = new Map(prev.map(item => [keyFn(item), item]))
  const nextKeys = new Set(next.map(keyFn))
  const removed = new Set([...prevByKey.keys()].filter(k => !nextKeys.has(k)))

  let result = server.filter(item => !removed.has(keyFn(item)))
  for (const item of next) {
    const key = keyFn(item)
    const before = prevByKey.get(key)
    if (before && JSON.stringify(before) === JSON.stringify(item)) continue // unchanged locally
    const idx = result.findIndex(existing => keyFn(existing) === key)
    if (idx === -1) result = [...result, item]
    else result = result.map((existing, i) => (i === idx ? item : existing))
  }
  return result
}

export const recipeKey = (recipe) => String(recipe?.id ?? recipe?.name ?? '')
export const shoppingKey = (item) => `${String(item?.name || '').toLowerCase().trim()}|${String(item?.brand || '').toLowerCase().trim()}`
