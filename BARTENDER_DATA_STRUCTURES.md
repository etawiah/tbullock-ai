# Bartender Data Structures - Reference

**Purpose**: Document the actual data structures used by the existing bartender system (App.jsx) that the Menu Builder integrates with.

**Source Code**: `src/App.jsx` (RecipeBuilder component, inventory state, spirit types)

---

## 1. Favorite / Custom Recipe

**Location in Code**: App.jsx lines ~1700-1850 (RecipeBuilder component)

**KV Key**: `favorites` (stored as array)

**Structure**:
```typescript
interface Favorite {
  id: string | number;           // Created via Date.now() when saving recipe
  name: string;                  // Display name of the drink
  ingredients: Array<{
    value: string;               // Ingredient name (e.g., "Vodka", "Tito's", "Lime Juice")
    amount?: string;             // Numeric string (e.g., "1.5")
    unit?: string;               // Unit (e.g., "oz", "ml", "dash")
  }>;
  instructions?: string;         // How to make the drink
  glass?: string;                // Glassware type (e.g., "martini", "coupe", "highball")
  garnish?: string;              // Garnish description (e.g., "twist of lemon")
  tags?: string;                 // Space or comma-separated tags (e.g., "spicy signature")
  created?: number;              // Unix timestamp when created
}
```

**Example**:
```json
{
  "id": 1674850200,
  "name": "Espresso Martini",
  "ingredients": [
    {"value": "Vodka", "amount": "1.5", "unit": "oz"},
    {"value": "Coffee Liqueur", "amount": "0.5", "unit": "oz"},
    {"value": "Fresh Espresso", "amount": "1", "unit": "oz"}
  ],
  "instructions": "Shake all ingredients over ice. Strain into chilled coupe glass.",
  "glass": "coupe",
  "garnish": "3 coffee beans",
  "tags": "signature coffee",
  "created": 1674850200
}
```

**How Menu Builder Uses It**:
- Menu item's `favoriteId` field matches favorite's `id`
- `checkIngredientAvailability()` iterates over `ingredients[].value` to verify against inventory
- Public menu hidden if any ingredient missing

---

## 2. Inventory Item

**Location in Code**: App.jsx lines 69-93 (SPIRIT_TYPES), 95-110 (createEmptyInventoryItem)

**KV Key**: `inventory` (stored as array)

**Structure**:
```typescript
interface InventoryItem {
  type: string;                  // Spirit type: "Vodka", "Gin", "Rum", "Tequila", "Whiskey",
                                 // "Brandy", "Liqueur", "Wine", "Beer", "Mixer", "Tool",
                                 // "Garnish", "Bitters", "Syrup", etc.
  brand: string;                 // Brand name (e.g., "Tito's", "Tanqueray", "Bacardi")
  name: string;                  // Display name (e.g., "Vodka: Tito's Handmade")
  proof?: string;                // Proof notation (e.g., "100", "94 proof")
  bottleSizeMl?: number;         // Bottle size in milliliters (e.g., 750, 1000)
  amountRemaining?: number;      // Current amount in milliliters (e.g., 500)
  flavorNotes?: string;          // AI-generated flavor profile (filled by /api/enrich-inventory)
}
```

**SPIRIT_TYPES Enum** (from App.jsx):
```
'Aperitif', 'Beer', 'Bitters', 'Bourbon', 'Brandy', 'Cognac', 'Digestif',
'Garnish', 'Gin', 'Liqueur', 'Mezcal', 'Mixer', 'Rum', 'Rye', 'Scotch',
'Syrup', 'Tequila', 'Tool', 'Vermouth', 'Vodka', 'Whiskey', 'Wine', 'Other'
```

**Example**:
```json
{
  "type": "Vodka",
  "brand": "Tito's",
  "name": "Vodka: Tito's Handmade",
  "proof": "100",
  "bottleSizeMl": 750,
  "amountRemaining": 500,
  "flavorNotes": "Smooth, slightly sweet with subtle vanilla notes. Versatile in cocktails."
}
```

**Stock Level Indicators** (from App.jsx):
```
< 10%  → Critical (🔴)
10-25% → Low Stock (🟡)
25-50% → Medium (🟢)
> 50%  → Good (🟢)
```

**No Progress Types** (excluded from stock tracking):
```
'other', 'garnish', 'tool', 'bitters'
```

**How Menu Builder Uses It**:
- `checkIngredientAvailability()` searches for ingredient.value (e.g., "Vodka") in inventory
- Ingredient considered available if `amountRemaining > 0` (any amount in stock)
- Matching is case-insensitive and supports partial matches
- Empty inventory → all items auto-hidden from public menu

---

## 3. Menu Item (Menu Builder)

**Location in Code**: `worker/worker.ts` (newly created)

**KV Key**: `menu:live` (stored as single Menu object)

**Structure**:
```typescript
interface MenuItem {
  id: string;                    // Unique within menu (kebab-case)
  favoriteId: string | number;   // Reference to favorite.id
  name: string;                  // Display name (e.g., "House Espresso Martini")
  description: string;           // Short description (supports markdown)
  primarySpirit: 'vodka' | 'gin' | 'rum' | 'tequila' | 'whiskey' | 'brandy' |
                 'liqueur' | 'wine' | 'beer' | 'mixer' | 'other';
  tags?: string[];               // UI tags (e.g., ["signature", "coffee"])
  status: 'active' | 'temporarily_unavailable' | 'retired';
  version: number;               // Optimistic concurrency control
  updatedAt: string;             // ISO-8601 UTC timestamp
  updatedBy: string;             // Admin email
}

interface Menu {
  id: 'menu-primary';            // Fixed ID (single menu)
  items: MenuItem[];             // Array of menu items
  version: number;               // Menu-wide version
  updatedAt: string;             // ISO-8601 UTC timestamp
  updatedBy: string;             // Email of admin who last changed menu
}
```

**Example**:
```json
{
  "id": "espresso-martini-house",
  "favoriteId": 1674850200,
  "name": "House Espresso Martini",
  "description": "Premium vodka with fresh espresso and coffee liqueur",
  "primarySpirit": "vodka",
  "tags": ["signature", "coffee"],
  "status": "active",
  "version": 1,
  "updatedAt": "2025-01-27T14:30:00Z",
  "updatedBy": "eugene@tawiah.net"
}
```

**Status Semantics**:
- `active` - Visible to public (if all ingredients available)
- `temporarily_unavailable` - Hidden from public (ingredient missing or admin set)
- `retired` - Hidden from public (archived, preserved for rollback)

---

## 4. Snapshot (Menu Rollback)

**Location in Code**: `worker/worker.ts` createSnapshot(), getSnapshot()

**KV Keys**: `menu:snapshot:v{N}` (one per version)

**Structure**:
```typescript
// Identical to Menu structure above
// Stores complete menu state at each version for rollback
```

**Example**:
```
menu:snapshot:v1 → {id: "menu-primary", items: [...], version: 1, ...}
menu:snapshot:v2 → {id: "menu-primary", items: [...], version: 2, ...}
menu:snapshot:v3 → {id: "menu-primary", items: [...], version: 3, ...}
```

---

## 5. Storage Summary

| Key | Type | Source | Purpose |
|-----|------|--------|---------|
| `favorites` | Array[Favorite] | Bartender frontend | Custom recipes (read-only by menu builder) |
| `inventory` | Array[InventoryItem] | Bartender frontend | Spirits & ingredients (read-only by menu builder) |
| `menu:live` | Menu | Menu builder | Current live menu (written by menu builder) |
| `menu:snapshot:v{N}` | Menu | Menu builder | Historical snapshots (for rollback) |

All stored in: `BARTENDER_KV` (Cloudflare KV namespace)

---

## 6. Data Flow During Ingredient Availability Check

### Step 1: Recipe Has These Ingredients
```
Favorite "Espresso Martini":
  ingredients: [
    {value: "Vodka", amount: "1.5", unit: "oz"},
    {value: "Coffee Liqueur", amount: "0.5", unit: "oz"},
    {value: "Espresso", amount: "1", unit: "oz"}
  ]
```

### Step 2: Inventory Has These Items
```
[
  {type: "Vodka", brand: "Tito's", name: "Vodka: Tito's", amountRemaining: 500},
  {type: "Liqueur", brand: "Kahlua", name: "Liqueur: Kahlua", amountRemaining: 400},
  {type: "Other", brand: "", name: "Espresso (Fresh)", amountRemaining: 50}
]
```

### Step 3: Matching
```
1. "Vodka" → Found in inventory.name "Vodka: Tito's" ✓ (500ml > 0)
2. "Coffee Liqueur" → Found in inventory.name "Liqueur: Kahlua" ✓ (400ml > 0)
3. "Espresso" → Found in inventory.name "Espresso (Fresh)" ✓ (50ml > 0)

Result: All ingredients available → status stays "active"
```

### Step 4: If One Ingredient Missing
```
Remove Kahlua from inventory → amountRemaining: 0

"Coffee Liqueur" → Found but amountRemaining = 0 ✗

Result: Missing ingredient → status auto-downgrades to "temporarily_unavailable"
        Item hidden from public menu until Kahlua re-stocked
```

---

## 7. API Endpoints That Use These Data Structures

### Bartender Frontend Endpoints

```
GET /api/favorites           → Returns { favorites: Array[Favorite] }
POST /api/favorites          → Saves favorites array
GET /api/inventory           → Returns { inventory: Array[InventoryItem] }
POST /api/inventory          → Saves inventory array
```

### Menu Builder Endpoints

```
GET /api/menu                → Public menu (reads menu:live, validates ingredients)
GET /api/menu/admin          → Admin menu (reads menu:live, all items)
POST /api/menu/items         → Create menu item (reads favorites, inventory)
PATCH /api/menu/items/{id}   → Update menu item (reads favorites, inventory)
DELETE /api/menu/items/{id}  → Soft-delete item
POST /api/menu/rollback/{v}  → Restore snapshot version
```

---

## 8. Implementation Notes for Menu Builder

### Assumption 1: Ingredient Matching
- Bartender frontend stores ingredients with `.value` field in RecipeBuilder
- Menu builder searches inventory by matching `.value` against inventory items
- Multiple matching patterns support flexibility (brand, type, name combinations)

### Assumption 2: Availability = amountRemaining > 0
- Any amount in stock = available
- Zero or missing amountRemaining = unavailable
- No minimum quantity thresholds

### Assumption 3: No Data Duplication
- Favorites and inventory are source of truth (owned by bartender frontend)
- Menu builder only READS favorites/inventory, never WRITES
- Menu builder creates new data only for menu items and snapshots

### Assumption 4: Free Cloudflare Plan
- KV data accessed directly (no HTTP calls across workers)
- No snapshot index (KV list API not available in free tier)
- Snapshots created but soft-limited to 10 (not auto-pruned)

---

## 9. Example: Creating a Menu Item

```
Admin:
POST /api/menu/items
{
  "id": "house-daiquiri",
  "favoriteId": 1674850210,          ← Must match a favorite.id in 'favorites' KV
  "name": "House Daiquiri",
  "description": "White rum, lime, simple syrup",
  "primarySpirit": "rum",
  "tags": ["classic"],
  "status": "active"
}

Menu Builder:
1. Validate schema ✓
2. fetchFavorite(1674850210, kv)
   → Reads 'favorites' KV
   → Finds { id: 1674850210, name: "Daiquiri", ingredients: [{value: "White Rum"}, ...] }
3. checkIngredientAvailability(favorite, kv)
   → Reads 'inventory' KV
   → Checks "White Rum" against inventory items
   → If found with amountRemaining > 0 → returns true
   → If not found or amount ≤ 0 → returns false
4. If false: status = "temporarily_unavailable"
   If true: status = "active" (as requested)
5. Save to 'menu:live' KV
6. Create snapshot at 'menu:snapshot:v{N}' KV

Response:
200 OK
{
  "success": true,
  "data": {
    "message": "Item added successfully",
    "id": "house-daiquiri",
    "version": 1,
    "menuVersion": 2,
    "updatedAt": "2025-01-27T14:35:00Z"
  }
}
```

---

**End of Data Structures Reference**
