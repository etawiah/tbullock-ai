# Menu Builder Phase 3 - Integration Notes

**Date**: 2025-11-30
**Status**: Integrated with existing bartender system (no second copy of data)
**Author**: AI Implementation

---

## Summary

The Menu Builder Phase 3 Worker is now **fully integrated** with the existing bartender favorites/inventory system. No separate data models were created.

### Files Modified/Created

1. **`worker/worker.ts`** (UPDATED)
   - Implemented `fetchFavorite(favoriteId, kv)` - reads from existing `favorites` KV
   - Implemented `checkIngredientAvailability(favorite, kv)` - validates against existing `inventory` KV
   - All menu endpoints now reference bartender data directly
   - Added detailed JSDoc comments documenting data source assumptions

2. **`integration-test.sh`** (CREATED)
   - Bash script to test all 6 Menu Builder endpoints
   - Configurable via env vars: `BASE_URL_PUBLIC`, `BASE_URL_ADMIN`, `ADMIN_EMAIL`
   - Tests: GET public, GET admin, POST create, PATCH update, DELETE soft-delete, POST rollback
   - Returns exit code 0 on success, 1 on failure

3. **`MENU_BUILDER_INTEGRATION_NOTES.md`** (THIS FILE)
   - Documents integration assumptions and data mappings

---

## Integration Details

### Data Sources

#### Favorites (Custom Recipes)

**Source**: App.jsx `RecipeBuilder` component (lines ~1700-1850)

**KV Storage**: `BARTENDER_KV` key `favorites`
- Array of recipe objects
- Stored at same location as `/api/favorites` endpoint

**Data Structure**:
```typescript
interface Favorite {
  id: string | number;           // From Date.now() in RecipeBuilder
  name: string;
  ingredients: Array<{
    value: string;               // Ingredient name (e.g., "Vodka")
    amount?: string;             // Numeric amount
    unit?: string;               // Unit (e.g., "oz", "ml")
  }>;
  instructions?: string;
  glass?: string;                // Note: "glass" not "glassware"
  garnish?: string;
  tags?: string;                 // Space/comma-separated
  created?: number;              // Unix timestamp
}
```

**Menu Builder Reference**:
- `POST /api/menu/items` requires `favoriteId` (matches `Favorite.id`)
- `fetchFavorite()` looks up favorite by ID in this array
- If not found → 400 "Favorite not found" error

---

#### Inventory

**Source**: App.jsx inventory state (lines ~1200-1400)

**KV Storage**: `BARTENDER_KV` key `inventory`
- Array of inventory items
- Stored at same location as `/api/inventory` endpoint
- Matches `SPIRIT_TYPES` array (lines 69-93 in App.jsx)

**Data Structure**:
```typescript
interface InventoryItem {
  name: string;                  // E.g., "Vodka: Tito's Handmade"
  type?: string;                 // E.g., "Vodka", "Gin", "Liqueur", "Tool", "Garnish"
  brand?: string;                // E.g., "Tito's"
  proof?: string;                // E.g., "100"
  bottleSizeMl?: number;         // E.g., 750
  amountRemaining?: number;      // Current amount in ml (e.g., 500)
  flavorNotes?: string;
}
```

**Menu Builder Reference**:
- `checkIngredientAvailability()` validates favorite ingredients against this array
- Ingredient matched if found in inventory with `amountRemaining > 0`
- If inventory empty or ingredient missing → item auto-downgraded to `temporarily_unavailable`

---

### Integration Points

#### 1. `fetchFavorite(favoriteId: string | number, kv: KVNamespace): Promise<Favorite | null>`

**What it does**:
- Reads `BARTENDER_KV.get('favorites')` (same as `/api/favorites` endpoint)
- Searches array for favorite with matching `id`
- Handles ID as both string and number (Date.now() creates numbers)

**Called by**:
- `POST /api/menu/items` - validate favorite exists before creating menu item
- `PATCH /api/menu/items/{id}` - re-validate favorite when updating status
- `GET /api/menu` - fetch each menu item's favorite to verify ingredients

**Error Handling**:
- Returns `null` if favorite not found
- Throws 500 if KV access fails
- Returns 400 Bad Request to client if favorite not found

---

#### 2. `checkIngredientAvailability(favorite: Favorite | null, kv: KVNamespace): Promise<boolean>`

**What it does**:
- Reads `BARTENDER_KV.get('inventory')` (same as `/api/inventory` endpoint)
- For each `favorite.ingredients[].value`, searches inventory
- Returns `true` only if ALL ingredients found with `amountRemaining > 0`

**Matching Strategy** (case-insensitive):
1. **Exact/partial name match**: "Vodka" matches inventory item "Vodka: Tito's"
2. **Brand match**: "Tito's" matches inventory item with brand "Tito's"
3. **Type+Brand+Name pattern**: "Vodka Tito's" matches type "Vodka", brand "Tito's"

**Called by**:
- `POST /api/menu/items` - validate before creating (auto-downgrade status if missing)
- `PATCH /api/menu/items/{id}` - re-validate when updating (auto-downgrade status if missing)
- `GET /api/menu` - filter items for public (hide if ingredients missing)

**Error Handling**:
- Returns `false` if inventory empty (safe default)
- Returns `false` on KV error (don't serve drink with unverified ingredients)
- Logs error and continues (graceful degradation)

---

## Data Flow

### Creating a Menu Item

```
Admin POST /api/menu/items {favoriteId: "espresso-martini", ...}
  ↓
1. validateMenuItem() - check JSON schema
  ↓
2. fetchFavorite("espresso-martini", kv)
   → Reads BARTENDER_KV 'favorites'
   → Finds { id: "espresso-martini", name: "Espresso Martini", ingredients: [...] }
   → Returns Favorite object
  ↓
3. checkIngredientAvailability(favorite, kv)
   → Reads BARTENDER_KV 'inventory'
   → For each ingredient.value, searches inventory
   → Returns true if all found with amountRemaining > 0
  ↓
4. If ingredients missing: auto-set status: "temporarily_unavailable"
   Else: use admin's requested status
  ↓
5. Save menu item to BARTENDER_KV 'menu:live'
   Create snapshot at BARTENDER_KV 'menu:snapshot:v{N}'
  ↓
200 OK response with item version and menu version
```

### Getting Public Menu

```
Guest GET /api/menu
  ↓
1. Fetch BARTENDER_KV 'menu:live'
  ↓
2. For each item with status == "active":
   a. fetchFavorite(item.favoriteId, kv)
   b. checkIngredientAvailability(favorite, kv)
   c. If ingredients missing: skip item (don't return to public)
  ↓
3. Filter to only items with available ingredients
  ↓
4. Sort by primarySpirit group, then alphabetically by name
  ↓
5. Return public response (exclude internal fields)
```

---

## Assumptions & Constraints

### Assumptions Made

1. **Favorites stored in BARTENDER_KV `favorites` key**
   - Same location as existing `/api/favorites` endpoint
   - Assumption: bartender frontend already syncs favorites to KV
   - No HTTP API calls to bartender system (direct KV read)

2. **Inventory stored in BARTENDER_KV `inventory` key**
   - Same location as existing `/api/inventory` endpoint
   - Assumption: bartender frontend syncs inventory to KV
   - No HTTP API calls (direct KV read)

3. **Favorite.ingredients[].value is the ingredient name**
   - App.jsx RecipeBuilder stores ingredients with `value` field
   - Menu builder matches this against inventory

4. **InventoryItem.name contains full ingredient identifier**
   - Can be "Vodka: Tito's" or "Tito's" or just "Vodka"
   - Partial/fuzzy matching supports all patterns

5. **InventoryItem.amountRemaining > 0 means ingredient is available**
   - Exact semantics: if amount ≤ 0 or missing → unavailable

6. **Menu items reference favorites by ID**
   - `menuItem.favoriteId` must match a `favorite.id`
   - No secondary data sync needed (single source of truth)

### Constraints

1. **Free Cloudflare Plan**
   - No cross-service requests (workers-to-workers RPC not used)
   - Direct KV read only (fast, free)
   - Snapshots limited to 10 per menu (configurable constant)

2. **No Second Copy of Data**
   - Menu builder READS favorites/inventory but doesn't WRITE to them
   - Favorites/inventory managed exclusively by bartender frontend
   - Menu builder only writes to `menu:live` and `menu:snapshot:v{N}`

3. **No Async Data Sync**
   - If inventory changes, public menu reflects change on next GET
   - No webhooks or event triggers
   - Simple polling via GET requests

---

## File Modifications Summary

### `worker/worker.ts`

**Changed**:
- Updated `Favorite` interface with actual App.jsx structure
  - Added JSDoc comments explaining data source
  - Changed `glassware` → `glass` (matches App.jsx)
  - Added `value` field to ingredient (matches RecipeBuilder)

- Updated `InventoryItem` interface
  - Added JSDoc comments with SPIRIT_TYPES reference
  - Clarified fields: type, brand, bottleSizeMl, amountRemaining

- Implemented `fetchFavorite(favoriteId, kv)`
  - Reads from BARTENDER_KV 'favorites'
  - Handles ID as string or number
  - Detailed JSDoc with implementation notes

- Implemented `checkIngredientAvailability(favorite, kv)`
  - Reads from BARTENDER_KV 'inventory'
  - 3-pattern matching strategy (name, brand, type+brand+name)
  - Detailed JSDoc with matching examples

- Updated all calls to these functions
  - `handleGetMenu()` now verifies ingredients for public
  - `handlePostMenuItem()` calls both functions
  - `handlePatchMenuItem()` re-validates on update

**Did NOT change**:
- Menu routing/endpoints
- Validation schemas
- Error response formats
- Optimistic concurrency (version checking)
- Snapshot creation/rollback logic
- Cloudflare Access auth

---

## Testing

### Integration Test Script

**File**: `integration-test.sh`

**Usage**:
```bash
# With defaults (PUBLIC=ai-bartender.pages.dev, ADMIN=admin.ai-bartender.pages.dev, EMAIL=eugene@tawiah.net)
./integration-test.sh

# With custom URLs
./integration-test.sh \
  --base-public https://example.com \
  --base-admin https://admin.example.com \
  --email alex@example.com
```

**Tests Included**:
1. GET /api/menu - public menu (no auth)
2. GET /api/menu/admin - admin view (with auth)
3. POST /api/menu/items - create item
4. PATCH /api/menu/items/{id} - update item
5. DELETE /api/menu/items/{id} - soft-delete
6. POST /api/menu/rollback/{version} - rollback

**Exit Codes**:
- 0: All tests passed
- 1: At least one test failed

**Prerequisites**:
- Worker deployed to production
- Cloudflare Access policy created (email domain allowlist)
- At least one favorite in `BARTENDER_KV 'favorites'`
- Some inventory in `BARTENDER_KV 'inventory'`

---

## Manual Testing with cURL

### Create Test Favorites

```bash
curl -X POST https://ai-bartender.pages.dev/api/favorites \
  -H "Content-Type: application/json" \
  -d '[
    {
      "id": "espresso-martini",
      "name": "Espresso Martini",
      "ingredients": [
        {"value": "Vodka", "amount": "1.5", "unit": "oz"},
        {"value": "Coffee Liqueur", "amount": "0.5", "unit": "oz"}
      ],
      "instructions": "Shake with ice",
      "glass": "martini"
    }
  ]'
```

### Create Test Inventory

```bash
curl -X POST https://ai-bartender.pages.dev/api/inventory \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "Vodka: Tito's", "type": "Vodka", "brand": "Tito's", "amountRemaining": 500},
    {"name": "Coffee Liqueur: Kahlua", "type": "Liqueur", "brand": "Kahlua", "amountRemaining": 400}
  ]'
```

### Create Menu Item

```bash
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: eugene@tawiah.net" \
  -d '{
    "id": "espresso-martini-1",
    "favoriteId": "espresso-martini",
    "name": "House Espresso Martini",
    "description": "Premium vodka and fresh espresso",
    "primarySpirit": "vodka",
    "status": "active"
  }'
```

### Get Public Menu (Ingredients Validated)

```bash
curl https://ai-bartender.pages.dev/api/menu
```

Only returns items with:
1. `status: "active"` AND
2. All ingredients found in inventory with `amountRemaining > 0`

---

## Remaining TODOs

### For User (Manual)

- [ ] Deploy worker to production with `wrangler deploy`
- [ ] Create Cloudflare Access policy (email domain allowlist: @tawiah.net, @eugenetawiah.com)
- [ ] Test with actual favorites and inventory data
- [ ] Run integration test script: `./integration-test.sh`

### For Future Work (Out of Scope)

- [ ] Real-time ingredient availability (WebSocket updates)
- [ ] Batch operations (bulk add/update items)
- [ ] Ingredient fuzzy matching (typo tolerance)
- [ ] Cache headers for public GET (Cache-Control)
- [ ] Detailed audit logging (moved to simple updatedBy/updatedAt)
- [ ] Admin UI for menu editing (Phase 4+)

---

## Questions & Clarifications

**Q: What if favorite.ingredients is missing?**
A: Assume all ingredients available (`checkIngredientAvailability()` returns `true`). Item stays `active`.

**Q: What if inventory is empty?**
A: Assume all ingredients unavailable. All items auto-downgrade to `temporarily_unavailable`.

**Q: Can I edit favorites/inventory from the menu builder?**
A: No. Menu builder is READ-ONLY for favorites/inventory. Only writes to menu. Favorites/inventory managed by bartender frontend.

**Q: What if favorite doesn't exist but I create a menu item?**
A: 400 Bad Request error. Menu item not created.

**Q: Can I manually set status: active even if ingredients missing?**
A: No. Menu builder auto-downgrades to `temporarily_unavailable` if ingredients missing. Admin can see actual status in admin view.

**Q: Does public menu show retired items?**
A: No. Only active items with available ingredients. Retired items visible only in admin view.

---

## Summary Table

| Component | Source | Read/Write | Location |
|-----------|--------|------------|----------|
| Favorites | bartender App.jsx | Read only | BARTENDER_KV `favorites` |
| Inventory | bartender App.jsx | Read only | BARTENDER_KV `inventory` |
| Menu items | Menu Builder | Read/Write | BARTENDER_KV `menu:live` |
| Snapshots | Menu Builder | Write only | BARTENDER_KV `menu:snapshot:v*` |

All in same `BARTENDER_KV` namespace → zero network overhead, instant consistency.

---

**End of Integration Notes**
