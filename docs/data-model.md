# Data model (Cloudflare KV namespace `BARTENDER_KV`)

There is no database schema. Each list is one JSON value under one KV key.
Production namespace `d55eed47…`, preview/dev namespace `c39c2a7f…`
(`BARTENDER_KV_preview`, used by `wrangler dev --remote`).

| Key | Shape | Written by |
|---|---|---|
| `inventory` | `InventoryItem[]` | App saves, chat inventory updates |
| `recipes` | `Recipe[]` (the app calls these "Favorites") | App |
| `shopping` | `ShoppingItem[]` | App |
| `chatHistory` | `{ role: 'user'\|'assistant', content }[]`, last 200 | App |
| `rev:inventory`, `rev:recipes`, `rev:shopping` | integer as text | Worker, on every save |
| `backup:<key>:<YYYY-MM-DD>` | copy of `<key>` from before that day's first save | Worker (14 kept per key) |
| `menu:live` | `{ id, items: MenuItem[], version, publishedAt, publishedBy }` | Menu editor (publish) |
| `menu:draft` | `{ id, items, version: 0, draftAt, draftBy }` | Menu editor (save draft) |
| `menu:snapshot:v<N>` | copy of `menu:live` at version N | Worker on publish/rollback |
| `favorites` | legacy, unused | — |

## Shapes

```ts
InventoryItem {
  type: string            // 'Vodka', 'Gin', … 'Tool', 'Other'
  brand: string
  name: string            // matching key for pours/chat updates
  proof: string
  bottleSizeMl: string    // numbers are stored as strings
  amountRemaining: string // ml, or non-numeric like 'In Stock'
  flavorNotes: string
}

Recipe {
  id: number              // Date.now() at creation; key for merging
  name, instructions, glass, garnish, tags, menuDescription: string
  primarySpirit: string   // menu category
  ingredients: { name: string, amount: string, unit: 'ml'|'oz'|'dash'|'tsp' }[]
  selectedBottles: { [ingredientName]: inventoryItemName }  // remembered choices
  created: number
}

ShoppingItem {
  name: string, brand: string, type: string,
  size?: string, amount?: string,
  source: 'low-stock' | 'recipe',  // low-stock entries clear when the bottle is restocked
  added: number
}

MenuItem {
  id: string              // 'menu-<recipeId>'
  favoriteId: number      // recipe id; items whose recipe was deleted are hidden
  name, description, primarySpirit: string
  status: 'active' | 'temporarily_unavailable' | 'retired'
  tags: string[]
}
```

## Revisions (conflict check)

`GET /api/<list>` returns `{ <list>: [...], stored, rev }`. `POST` accepts
`{ <list>: [...], rev }`. If `rev` doesn't match `rev:<key>`, the Worker
returns **409** `{ conflict: true, rev, <list>: current }` and writes nothing.
A POST without `rev` (older app builds) is accepted. `stored: false` means the
key has never been written, which is the only time the app seeds demo data.

## Restoring data

**Easiest: Export everything.** Inventory → ⋮ → *Export everything (backup)*
saves `bar-backup-YYYY-MM-DD.json`. To restore the inventory from it: Inventory
→ ⋮ → *Import JSON* → pick that file → confirm.

**From the automatic daily backups** (any list), with Wrangler on your computer:

```bash
npx wrangler kv key list --binding BARTENDER_KV --remote --prefix backup:
```

```bash
npx wrangler kv key get --binding BARTENDER_KV --remote --text "backup:inventory:2026-11-18" > inventory-backup.json
```

```bash
npx wrangler kv key put --binding BARTENDER_KV --remote inventory --path inventory-backup.json
```

Then bump the revision so a phone that still has the old list open can't
overwrite the restore. Its next save gets a 409 and merges onto the restored
list instead:

```bash
npx wrangler kv key put --binding BARTENDER_KV --remote rev:inventory 100000
```

Finally, reload the app on both phones. Use `recipes`, `shopping` or
`chatHistory` in place of `inventory` for the other lists (chat history has no
revision to bump).
