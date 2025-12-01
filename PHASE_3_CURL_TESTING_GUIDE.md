# Phase 3 Menu Builder - cURL Testing Guide

**Purpose**: Manual validation of all Menu Builder endpoints after deployment
**Prerequisites**:
- Worker deployed to production
- Cloudflare Access policy created and configured
- Favorites and inventory data populated in KV
- cURL installed (or use Postman/HTTP client)

---

## Quick Reference

### Base URLs
- **Production**: `https://ai-bartender.pages.dev` (or your custom domain)
- **Admin subdomain**: `https://admin.ai-bartender.pages.dev` (protected by Access)
- **Local dev**: `http://localhost:8787`

### Auth Headers (Admin Endpoints)
```
-H "Cf-Access-Authenticated-User-Email: alex@tawiah.net"
```
(Replace with your actual email domain: @tawiah.net or @eugenetawiah.com)

---

## 1. PUBLIC ENDPOINTS (No Auth Required)

### GET /api/menu - Public Menu (Active Items Only)

**Test**: Get the public menu (guests see this)

```bash
curl https://ai-bartender.pages.dev/api/menu
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "menu-primary",
    "items": [
      {
        "id": "espresso-martini-1",
        "name": "Espresso Martini",
        "description": "Vodka, coffee liqueur, espresso, shaken over ice",
        "primarySpirit": "vodka",
        "tags": ["signature"],
        "status": "active"
      }
    ],
    "version": 3,
    "updatedAt": "2025-01-27T14:30:00Z"
  }
}
```

**Validations**:
- ✅ Only items with `status: "active"` returned
- ✅ Items sorted by primarySpirit (vodka first), then alphabetically by name
- ✅ Internal fields excluded: `version` (per-item), `updatedBy`, `favoriteId`
- ✅ Menu version matches latest live menu
- ✅ Items with missing ingredients are hidden (auto-filtered)

**Troubleshooting**:
- Empty array → No active items with available ingredients
- 500 error → KV access failure (check Cloudflare KV status)
- Unexpected items missing → Check ingredient availability in inventory

---

## 2. ADMIN ENDPOINTS (Cloudflare Access Required)

### GET /api/menu/admin - Admin View (All Items)

**Test**: Get full menu including hidden items (admin only)

```bash
curl https://admin.ai-bartender.pages.dev/api/menu/admin \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net"
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "menu-primary",
    "items": [
      {
        "id": "espresso-martini-1",
        "favoriteId": "espresso-martini",
        "name": "Espresso Martini",
        "description": "Vodka, coffee liqueur, espresso, shaken over ice",
        "primarySpirit": "vodka",
        "tags": ["signature"],
        "status": "active",
        "version": 1,
        "updatedAt": "2025-01-27T14:30:00Z",
        "updatedBy": "alex@tawiah.net"
      },
      {
        "id": "vodka-martini-1",
        "favoriteId": "vodka-martini",
        "name": "Vodka Martini",
        "description": "Vodka, dry vermouth, olives",
        "primarySpirit": "vodka",
        "tags": [],
        "status": "temporarily_unavailable",
        "version": 2,
        "updatedAt": "2025-01-27T14:25:00Z",
        "updatedBy": "alex@tawiah.net"
      }
    ],
    "version": 3,
    "updatedAt": "2025-01-27T14:30:00Z",
    "updatedBy": "alex@tawiah.net"
  }
}
```

**Validations**:
- ✅ Includes ALL items (active, temporarily_unavailable, retired)
- ✅ Each item has version, updatedAt, updatedBy (full metadata)
- ✅ Items sorted by primarySpirit, then alphabetically
- ✅ Shows which items are hidden from public (status != "active")

**Troubleshooting**:
- 401 Unauthorized → Cloudflare Access not configured or email not in allowlist
- 403 Forbidden → Access policy error
- Empty array → Menu never created (run POST /api/menu/items first)

---

## 3. CREATE ITEM (Requires Valid Favorite)

### Setup: Populate Test Favorites (One-time)

**Before creating menu items, ensure at least one favorite exists in KV:**

```bash
# Get current favorites
curl https://ai-bartender.pages.dev/api/favorites

# If empty, POST test favorites:
curl -X POST https://ai-bartender.pages.dev/api/favorites \
  -H "Content-Type: application/json" \
  -d '[
    {
      "id": "espresso-martini",
      "name": "Espresso Martini",
      "ingredients": [
        {"name": "Vodka", "amount": 1.5, "unit": "oz"},
        {"name": "Coffee Liqueur", "amount": 0.5, "unit": "oz"},
        {"name": "Fresh Espresso", "amount": 1, "unit": "oz"}
      ],
      "instructions": "Shake all ingredients over ice. Strain into chilled glass."
    },
    {
      "id": "vodka-martini",
      "name": "Vodka Martini",
      "ingredients": [
        {"name": "Vodka", "amount": 2, "unit": "oz"},
        {"name": "Dry Vermouth", "amount": 0.5, "unit": "oz"}
      ],
      "instructions": "Stir with ice. Strain into chilled glass."
    }
  ]'
```

**Also populate test inventory:**

```bash
curl -X POST https://ai-bartender.pages.dev/api/inventory \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "Vodka: Titos", "type": "Vodka", "brand": "Titos", "bottleSizeMl": 750, "amountRemaining": 500},
    {"name": "Coffee Liqueur: Kahlua", "type": "Liqueur", "brand": "Kahlua", "bottleSizeMl": 750, "amountRemaining": 400}
  ]'
```

---

### POST /api/menu/items - Create Menu Item (Success Case)

**Test**: Add a new menu item

```bash
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "id": "espresso-martini-1",
    "favoriteId": "espresso-martini",
    "name": "Espresso Martini",
    "description": "Vodka, Kahlúa, fresh espresso, shaken over ice",
    "primarySpirit": "vodka",
    "tags": ["signature"],
    "status": "active"
  }'
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Item added successfully",
    "id": "espresso-martini-1",
    "version": 1,
    "menuVersion": 1,
    "updatedAt": "2025-01-27T14:35:00Z"
  }
}
```

**Validations**:
- ✅ Item created with version = 1
- ✅ Menu version incremented
- ✅ Snapshot created automatically
- ✅ Item returned in GET /api/menu (if all ingredients available)

**Test Edge Case**: Missing Ingredient → Auto-Downgrade Status

```bash
# First, remove an ingredient from inventory
curl -X POST https://ai-bartender.pages.dev/api/inventory \
  -H "Content-Type: application/json" \
  -d '[]'  # Empty inventory

# Then create item with missing ingredients
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "id": "vodka-martini-1",
    "favoriteId": "vodka-martini",
    "name": "Vodka Martini",
    "description": "Vodka, dry vermouth, olives",
    "primarySpirit": "vodka",
    "status": "active"
  }'
```

**Expected Behavior**:
```json
{
  "success": true,
  "data": {
    "message": "Item added successfully",
    "id": "vodka-martini-1",
    "version": 1,
    "menuVersion": 2,
    "updatedAt": "2025-01-27T14:40:00Z"
  }
}
```

**Validation**:
- ✅ Item created with `status: "temporarily_unavailable"` (auto-downgraded, not `active`)
- ✅ Item NOT visible in GET /api/menu (public)
- ✅ Item visible in GET /api/menu/admin with status showing why it's hidden

---

### POST /api/menu/items - Validation Failures

**Test 1**: Missing Required Field

```bash
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "id": "test-drink",
    "name": "Test Drink"
    # Missing: favoriteId, description, primarySpirit, status
  }'
```

**Expected Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {"field": "favoriteId", "message": "favoriteId is required and must be a string"},
    {"field": "description", "message": "description is required and must be a string"},
    {"field": "primarySpirit", "message": "primarySpirit is required and must be a string"},
    {"field": "status", "message": "status is required and must be a string"}
  ]
}
```

**Test 2**: Invalid primarySpirit

```bash
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "id": "test-drink",
    "favoriteId": "test",
    "name": "Test Drink",
    "description": "Test",
    "primarySpirit": "invalid_spirit",
    "status": "active"
  }'
```

**Expected Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "primarySpirit",
      "message": "primarySpirit must be one of: vodka, gin, rum, tequila, whiskey, brandy, liqueur, wine, beer, mixer, other"
    }
  ]
}
```

**Test 3**: Favorite Not Found

```bash
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "id": "unknown-drink-1",
    "favoriteId": "nonexistent-drink",
    "name": "Unknown Drink",
    "description": "A drink that doesn'\''t exist",
    "primarySpirit": "gin",
    "status": "active"
  }'
```

**Expected Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "favoriteId",
      "message": "Favorite 'nonexistent-drink' not found in bartender.tawiah.net"
    }
  ]
}
```

**Test 4**: Duplicate Item ID

```bash
# First, create an item
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{"id":"duplicate-test","favoriteId":"espresso-martini","name":"Test","description":"Test","primarySpirit":"vodka","status":"active"}'

# Then try to create another with same ID
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{"id":"duplicate-test","favoriteId":"espresso-martini","name":"Another","description":"Different","primarySpirit":"gin","status":"active"}'
```

**Expected Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "id",
      "message": "Item with id 'duplicate-test' already exists"
    }
  ]
}
```

---

## 4. UPDATE ITEM (Optimistic Concurrency)

### PATCH /api/menu/items/{id} - Update Item

**Prerequisite**: Know current item version (from GET /api/menu/admin)

```bash
# Get current state
curl https://admin.ai-bartender.pages.dev/api/menu/admin \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" | jq '.data.items[0]'
# Returns: version: 1, updatedBy: "...", etc.

# Update with correct version
curl -X PATCH https://admin.ai-bartender.pages.dev/api/menu/items/espresso-martini-1 \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "name": "Espresso Martini (Updated)",
    "description": "Vodka, coffee liqueur, fresh espresso - now with a twist!",
    "tags": ["signature", "coffee"],
    "version": 1
  }'
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Item updated successfully",
    "id": "espresso-martini-1",
    "version": 2,
    "menuVersion": 2,
    "updatedAt": "2025-01-27T14:45:00Z"
  }
}
```

**Validations**:
- ✅ Item version incremented (1 → 2)
- ✅ Menu version incremented
- ✅ `updatedBy` set to authenticated email
- ✅ `updatedAt` updated to current time

---

### PATCH /api/menu/items/{id} - Stale Version (409 Conflict)

**Test**: Update with wrong version

```bash
curl -X PATCH https://admin.ai-bartender.pages.dev/api/menu/items/espresso-martini-1 \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "name": "Updated Name",
    "version": 1
  }'
```

**Expected Response** (409 Conflict):
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Item version mismatch. You provided v1, but current is v2. Please refresh and retry."
}
```

**Validation**:
- ✅ Item not updated
- ✅ Client must re-fetch item and use new version number

---

### PATCH /api/menu/items/{id} - Auto-Downgrade Status

**Test**: Update status to active, but ingredients now missing

```bash
# Step 1: Clear inventory (make ingredients unavailable)
curl -X POST https://ai-bartender.pages.dev/api/inventory \
  -H "Content-Type: application/json" \
  -d '[]'

# Step 2: Update item status to active (should auto-downgrade)
curl -X PATCH https://admin.ai-bartender.pages.dev/api/menu/items/espresso-martini-1 \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "status": "active",
    "version": 2
  }'
```

**Expected Behavior**:
- Item updated, but status changed to `temporarily_unavailable` (auto-downgrade)
- Response shows success, admin can see actual status via GET /api/menu/admin

---

## 5. DELETE ITEM (Soft-Delete)

### DELETE /api/menu/items/{id} - Retire Item

**Test**: Soft-delete an item

```bash
# First, get current version
curl https://admin.ai-bartender.pages.dev/api/menu/admin \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" | jq '.data.items[] | select(.id == "espresso-martini-1") | .version'

# Delete with correct version
curl -X DELETE https://admin.ai-bartender.pages.dev/api/menu/items/espresso-martini-1 \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "version": 2
  }'
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Item retired successfully",
    "id": "espresso-martini-1",
    "menuVersion": 3
  }
}
```

**Validations**:
- ✅ Item status set to `retired`
- ✅ Item removed from GET /api/menu (public)
- ✅ Item still visible in GET /api/menu/admin (with status: "retired")
- ✅ Item preserved for rollback (not hard-deleted)
- ✅ Menu version incremented

---

## 6. ROLLBACK TO SNAPSHOT

### POST /api/menu/rollback/{version} - Restore Menu

**Test**: Rollback to previous version

```bash
# First, see available versions (check snapshots in admin view)
curl https://admin.ai-bartender.pages.dev/api/menu/admin \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" | jq '.data.version'
# Returns current version (e.g., 5)

# Rollback to version 2
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/rollback/2 \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{}'
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Menu rolled back to version 2",
    "fromVersion": 5,
    "toVersion": 6,
    "updatedAt": "2025-01-27T15:00:00Z"
  }
}
```

**Validations**:
- ✅ Menu restored to version 2 state
- ✅ New version created (6) with timestamp
- ✅ Snapshot preserved for re-rollback
- ✅ GET /api/menu shows restored menu

**Test Error Case**: Rollback to Future Version

```bash
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/rollback/99 \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{}'
```

**Expected Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "version",
      "message": "Cannot rollback to version 99; current is 6. You can only rollback to older versions."
    }
  ]
}
```

---

## 7. SORTING & GROUPING

### GET /api/menu - Verify Sorting

**Test**: Create items across different spirit categories and verify sorting

```bash
# Create items in various spirits
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{"id":"gin-gimlet","favoriteId":"espresso-martini","name":"Gimlet","description":"Gin, lime juice, simple syrup","primarySpirit":"gin","status":"active"}'

curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{"id":"rum-mai-tai","favoriteId":"espresso-martini","name":"Mai Tai","description":"Rum, lime, orgeat, orange curacao","primarySpirit":"rum","status":"active"}'

curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{"id":"vodka-cosmopolitan","favoriteId":"espresso-martini","name":"Cosmopolitan","description":"Vodka, triple sec, cranberry, lime","primarySpirit":"vodka","status":"active"}'

# Get and verify order
curl https://ai-bartender.pages.dev/api/menu | jq '.data.items[] | {name, primarySpirit}'
```

**Expected Order** (by primarySpirit, then alphabetically):
```
1. Cosmopolitan (vodka)
2. Espresso Martini (vodka)   ← alphabetically after Cosmopolitan
3. Gimlet (gin)
4. Mai Tai (rum)
```

**Validation**:
- ✅ Vodka items first, sorted A-Z
- ✅ Then gin, rum, etc. in correct order
- ✅ Within group, alphabetically by name

---

## 8. AUTH ERROR CASES

### Missing Cloudflare Access Header

```bash
curl https://admin.ai-bartender.pages.dev/api/menu/admin
```

**Expected Response** (401 Unauthorized):
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Access authentication required"
}
```

### Wrong Email Domain

```bash
curl https://admin.ai-bartender.pages.dev/api/menu/admin \
  -H "Cf-Access-Authenticated-User-Email: alex@wrong-domain.com"
```

**Expected Response** (401 Unauthorized):
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Access authentication required"
}
```

---

## 9. PAYLOAD SIZE LIMIT

### Test Oversized Request

```bash
# Create a large JSON payload (>100 KB)
curl -X POST https://admin.ai-bartender.pages.dev/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d "$(python3 -c "print('{\"id\":\"test\",\"favoriteId\":\"x\",\"name\":\"' + 'y' * 200000 + '\",\"description\":\"z\",\"primarySpirit\":\"vodka\",\"status\":\"active\"}')")"
```

**Expected Response** (413 Payload Too Large):
```json
{
  "success": false,
  "error": "Payload Too Large",
  "message": "Request body exceeds 100 KB limit"
}
```

---

## 10. INTEGRATION TEST SCENARIO (Full Workflow)

**Scenario**: Admin adds a signature drink, then temporarily unavailable, then retires it

```bash
#!/bin/bash
set -e

BASE="https://admin.ai-bartender.pages.dev"
EMAIL="alex@tawiah.net"
ITEM_ID="daiquiri-signature"

echo "1. Create menu item..."
curl -X POST "$BASE/api/menu/items" \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: $EMAIL" \
  -d '{
    "id":"'$ITEM_ID'",
    "favoriteId":"daiquiri",
    "name":"Classic Daiquiri",
    "description":"White rum, fresh lime, simple syrup",
    "primarySpirit":"rum",
    "tags":["signature","classic"],
    "status":"active"
  }' | jq '.data.version'

echo "2. Get menu (should be visible)..."
curl https://ai-bartender.pages.dev/api/menu | jq '.data.items[] | select(.id == "'$ITEM_ID'")'

echo "3. Update to temporarily unavailable..."
curl -X PATCH "$BASE/api/menu/items/$ITEM_ID" \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: $EMAIL" \
  -d '{"status":"temporarily_unavailable","version":1}' | jq '.data.version'

echo "4. Get menu (should be hidden now)..."
curl https://ai-bartender.pages.dev/api/menu | jq '.data.items[] | select(.id == "'$ITEM_ID'")' || echo "✓ Item hidden (expected)"

echo "5. Get admin menu (should show temporarily_unavailable)..."
curl "$BASE/api/menu/admin" \
  -H "Cf-Access-Authenticated-User-Email: $EMAIL" | jq '.data.items[] | select(.id == "'$ITEM_ID'") | .status'

echo "6. Retire item..."
curl -X DELETE "$BASE/api/menu/items/$ITEM_ID" \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: $EMAIL" \
  -d '{"version":2}' | jq '.data.message'

echo "7. Verify retired in admin view..."
curl "$BASE/api/menu/admin" \
  -H "Cf-Access-Authenticated-User-Email: $EMAIL" | jq '.data.items[] | select(.id == "'$ITEM_ID'") | .status'

echo "✓ Full workflow complete!"
```

---

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Solution |
|---------|---|---|
| 401 Unauthorized | Missing/wrong email header | Use `-H "Cf-Access-Authenticated-User-Email: alex@tawiah.net"` |
| 403 Forbidden | Access policy misconfigured | Check Cloudflare Access policy settings |
| 404 Not Found | Item doesn't exist | Verify item ID exists in admin menu first |
| 409 Conflict | Stale version | GET item again, use current version |
| 500 Internal Server Error | KV access failure | Check Cloudflare KV status, verify KV namespace ID |
| Empty items array | No active items or all missing ingredients | Check inventory, populate with test data |
| Item not in public menu | Status ≠ "active" OR ingredients missing | Check status and inventory availability |

---

## Next Steps

1. **Run all tests above sequentially** to validate Phase 3
2. **Check logs** in Cloudflare Workers dashboard for any errors
3. **Verify KV snapshots** are being created (check Cloudflare KV UI)
4. **Test with real favorites** from your bartender system (not just test data)
5. **Load test** with many items to ensure performance

---

## Notes

- **Timestamps**: All `updatedAt` values are UTC ISO-8601 format
- **Email tracking**: `updatedBy` field shows which admin made each change
- **Sorting**: Applied at query time, not stored (no manual reordering needed)
- **Snapshots**: Auto-created after every write, max 10 retained
- **Rollback**: Can restore to any snapshot version (preserves all history)

