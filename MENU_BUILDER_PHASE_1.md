# Menu Builder - Phase 1 Deliverable
## Data Model & API Contract

**Status**: Final for Phase 1 (Revised)
**Date**: 2025-01-27 | Revised: 2025-11-30
**Scope**: JSON schema, API contract, field definitions (no code)

---

## REVISIONS (Nov 30, 2025)

**Design Changes**:
- **Removed**: HMAC-SHA256 signatures, shared secrets, x-admin-signature headers
- **Simplified**: Auth via Cloudflare Access only (email domain allowlist)
- **Removed**: Draft vs. published split; now single live menu with versioned snapshots for rollback
- **Removed**: Manual integer ordering; replaced with implicit alphabetical sort within primarySpirit groups
- **Added**: Reference to existing favorites/ingredients system (favoriteId foreign key)
- **Added**: Status field (active, temporarily_unavailable, retired) for menu items
- **Added**: Per-item version for optimistic concurrency control
- **Added**: Markdown support for descriptions (bold, italics, line breaks)
- **Added**: Automatic unavailability if required ingredients missing in favorites system

---

## 1. JSON Data Schema

### Menu Object (Root)

```json
{
  "id": "menu-primary",
  "items": [
    {
      "id": "espresso-martini-1",
      "favoriteId": "espresso-martini",
      "name": "Espresso Martini",
      "description": "Vodka, Kahlúa, fresh espresso, shaken over ice",
      "primarySpirit": "vodka",
      "tags": ["signature", "coffee"],
      "status": "active",
      "version": 1,
      "updatedAt": "2025-01-27T14:30:00Z",
      "updatedBy": "alex@tawiah.net"
    }
  ],
  "version": 1,
  "updatedAt": "2025-01-27T14:30:00Z",
  "updatedBy": "alex@tawiah.net"
}
```

### Item Fields Specification

| Field | Type | Required | Max Length | Notes |
|-------|------|----------|-----------|-------|
| `id` | string | Yes | 100 | Unique identifier (slug format: `kebab-case`). Immutable. Menu-scoped, not global. |
| `favoriteId` | string | Yes | 100 | Foreign key reference to favorite/drink in bartender.tawiah.net system. |
| `name` | string | Yes | 100 | Display name (trimmed, no leading/trailing spaces). |
| `description` | string | Yes | 500 | Ingredients/instructions. Supports markdown (bold, italics, line breaks). Trimmed. |
| `primarySpirit` | string | Yes | 50 | Spirit category (vodka, gin, rum, tequila, whiskey, brandy, liqueur, wine, beer, mixer, other). Determines grouping. |
| `tags` | array | No | — | Array of strings (max 10, each max 30 chars). E.g., ["signature", "spicy", "new"]. For UI highlights. |
| `status` | enum | Yes | — | One of: `active`, `temporarily_unavailable`, `retired`. Only `active` shown to guests. |
| `version` | integer | Yes | — | Per-item version (optimistic concurrency control). Starts at 1. Client includes this in updates; rejected if stale. |
| `updatedAt` | ISO-8601 | Yes | — | Last modification timestamp. UTC. |
| `updatedBy` | string | Yes | — | Email address of admin who last edited item. |

### Menu Root Fields Specification

| Field | Type | Required | Max Length | Notes |
|-------|------|----------|-----------|-------|
| `id` | string | Yes | 100 | Fixed: `"menu-primary"`. |
| `items` | array | Yes | — | Array of Item objects. Displayed sorted by primarySpirit group, then alphabetically by name within group. |
| `version` | integer | Yes | — | Menu-wide version (incremented on any save). Starts at 1. |
| `updatedAt` | ISO-8601 | Yes | — | Last modification timestamp (any change to menu or items). UTC. |
| `updatedBy` | string | Yes | — | Email of admin who last edited any item. |

### Primary Spirit Values (Grouping)

Listed in expected display order:

```
vodka, gin, rum, tequila, whiskey, brandy, liqueur, wine, beer, mixer, other
```

Items within each group are sorted **alphabetically by name** (no manual order fields).

---

## 2. KV Storage Schema

### Keys

| Key | Value Type | Scope | Notes |
|-----|-----------|-------|-------|
| `menu:live` | JSON string | Live menu | Current menu guests see. Updated on every admin save. Single source of truth. |
| `menu:snapshot:v{N}` | JSON string | Versioned snapshot | Immutable snapshot of menu at version N. Kept for rollback. Max 10 snapshots (configurable). |

### Single Live Menu Model

**Live Menu** (`menu:live`):
- Updated by admin endpoints (POST /api/menu/items, PATCH /api/menu/items/{id})
- Contains all items (status filters happen on client/at GET time)
- Editable indefinitely by admins
- Serves public and admin GETs (filtered by status for public)
- Snapshot created automatically on each save

**Snapshots** (`menu:snapshot:v{N}`):
- Immutable copies of menu at each version
- Max 10 retained (oldest pruned on new saves)
- Used for rollback via POST /api/menu/rollback/{version}
- Includes version and timestamp metadata

---

## 3. API Contract

### Public Endpoints

#### GET /api/menu
**Purpose**: Serve live menu to public (guests)
**Auth**: None
**Query Params**: None
**Request Body**: None
**Response**:
```json
{
  "success": true,
  "data": {
    "id": "menu-primary",
    "items": [
      {
        "id": "espresso-martini-1",
        "name": "Espresso Martini",
        "description": "Vodka, Kahlúa, fresh espresso, shaken over ice",
        "primarySpirit": "vodka",
        "tags": ["signature"],
        "status": "active"
      }
    ],
    "version": 1,
    "updatedAt": "2025-01-27T14:30:00Z"
  }
}
```

**Filtering**:
- Only items with `status: "active"` are returned.
- If any required ingredient (from favorites system) is missing/unavailable, item is treated as if `status: "temporarily_unavailable"` (hidden from public).

**Fallback**: Returns empty items array if KV key not found (graceful degradation).
**Cache**: Should be cacheable (Cache-Control headers in Phase 3/5).
**Status Codes**: 200 OK, 500 (KV error).

---

### Admin Endpoints (Cloudflare Access Only)

#### GET /api/menu/admin
**Purpose**: Fetch live menu for admin editing (all statuses visible)
**Auth**: Cloudflare Access (email @tawiah.net or @eugenetawiah.com)
**Query Params**: None
**Request Body**: None
**Response**:
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
        "description": "Vodka, Kahlúa, fresh espresso, shaken over ice",
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
        "version": 1,
        "updatedAt": "2025-01-27T14:00:00Z",
        "updatedBy": "alex@tawiah.net"
      }
    ],
    "version": 1,
    "updatedAt": "2025-01-27T14:30:00Z",
    "updatedBy": "alex@tawiah.net"
  }
}
```

**Difference from /api/menu**: Includes all items regardless of status. Includes version, updatedAt, updatedBy per item and menu-wide. Shows which items are hidden from public.
**Status Codes**: 200 OK, 401 Unauthorized (Access auth failed), 500 (KV error).

---

#### POST /api/menu/items
**Purpose**: Add new item to menu
**Auth**: Cloudflare Access (email @tawiah.net or @eugenetawiah.com)
**Request Headers**: `Content-Type: application/json`
**Request Body**:
```json
{
  "id": "espresso-martini-1",
  "favoriteId": "espresso-martini",
  "name": "Espresso Martini",
  "description": "Vodka, Kahlúa, fresh espresso, shaken over ice",
  "primarySpirit": "vodka",
  "tags": ["signature"],
  "status": "active"
}
```

**Processing**:
1. Verify user is authenticated via Cloudflare Access header `Cf-Access-Authenticated-User-Email`
2. Validate JSON schema (all required fields present)
3. Trim whitespace from name, description fields
4. Validate `primarySpirit` is in allowed list
5. Validate `tags` are valid format and count
6. Validate `status` is one of: active, temporarily_unavailable, retired
7. Check item `id` is unique within menu (no duplicates)
8. Fetch referenced favorite from bartender.tawiah.net system; if not found, return 400 with error
9. Check if all required ingredients in favorite are available; if not, auto-set `status: "temporarily_unavailable"`
10. Set `version: 1`, `updatedAt: now`, `updatedBy: email`
11. Fetch current menu, append new item, increment menu version, update menu timestamps
12. Save to KV key `menu:live`
13. Create snapshot `menu:snapshot:v{N}` (prune oldest if > 10 snapshots)

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Item added successfully",
    "id": "espresso-martini-1",
    "version": 1,
    "menuVersion": 2,
    "updatedAt": "2025-01-27T14:35:00Z"
  }
}
```

**Status Codes**: 200 OK, 400 Bad Request (validation, missing favorite), 401 Unauthorized, 413 Payload Too Large (> 100KB), 500 (KV error).

---

#### PATCH /api/menu/items/{id}
**Purpose**: Update existing menu item
**Auth**: Cloudflare Access
**Request Headers**: `Content-Type: application/json`
**Request Body**:
```json
{
  "name": "Espresso Martini",
  "description": "Vodka, Kahlúa, fresh espresso",
  "primarySpirit": "vodka",
  "tags": ["signature", "coffee"],
  "status": "active",
  "version": 1
}
```

**Processing**:
1. Verify authentication
2. Fetch current menu item by id; if not found, return 404
3. Validate client's `version` matches current item version (optimistic concurrency); reject with 409 Conflict if stale
4. Validate JSON schema
5. Trim whitespace
6. Validate field values (primarySpirit, status, tags)
7. If `favoriteId` exists, verify it's still valid in favorites system
8. Auto-update `status` to temporarily_unavailable if required ingredients missing
9. Increment item `version` by 1
10. Set `updatedAt: now`, `updatedBy: email`
11. Update item in menu, increment menu version
12. Save to KV and create snapshot

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Item updated successfully",
    "id": "espresso-martini-1",
    "version": 2,
    "menuVersion": 3,
    "updatedAt": "2025-01-27T14:40:00Z"
  }
}
```

**Status Codes**: 200 OK, 400 Bad Request (validation), 401 Unauthorized, 404 Not Found, 409 Conflict (stale version), 413 Payload Too Large, 500 (KV error).

---

#### DELETE /api/menu/items/{id}
**Purpose**: Remove item from menu (soft-delete: set status to retired)
**Auth**: Cloudflare Access
**Request Headers**: None (URL only)
**Request Body**:
```json
{
  "version": 1
}
```

**Processing**:
1. Verify authentication
2. Fetch item by id; if not found, return 404
3. Validate client version (optimistic concurrency)
4. Set `status: "retired"`, increment item version
5. Update menu, increment menu version
6. Save and snapshot

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Item retired successfully",
    "id": "espresso-martini-1",
    "menuVersion": 4
  }
}
```

**Status Codes**: 200 OK, 400 Bad Request, 401 Unauthorized, 404 Not Found, 409 Conflict, 500.

---

#### POST /api/menu/rollback/{version}
**Purpose**: Restore menu to a previous snapshot version
**Auth**: Cloudflare Access
**Request Headers**: None
**Request Body**: `{}`

**Processing**:
1. Verify authentication
2. Fetch snapshot `menu:snapshot:v{version}`; if not found, return 404
3. Verify snapshot version < current menu version (can only rollback to past, not forward)
4. Load snapshot as new live menu
5. Increment menu version, update timestamps
6. Save to `menu:live` and create new snapshot

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Menu rolled back to version 5",
    "fromVersion": 8,
    "toVersion": 9,
    "updatedAt": "2025-01-27T14:50:00Z"
  }
}
```

**Status Codes**: 200 OK, 400 Bad Request (rollback to future version), 401 Unauthorized, 404 Not Found, 500.

---

## 4. Validation Rules

### Field-Level Validation

| Field | Rule |
|-------|------|
| `id` | Regex: `^[a-z0-9\-]{1,100}$` (kebab-case). Unique within menu. Immutable. |
| `favoriteId` | Must reference existing favorite in bartender.tawiah.net system (validated at save time). |
| `name` | Non-empty after trim. Max 100 chars. No leading/trailing spaces. |
| `description` | Max 500 chars. Allow newlines and basic markdown (**bold**, *italic*, line breaks). Trim leading/trailing. |
| `primarySpirit` | Must be one of: vodka, gin, rum, tequila, whiskey, brandy, liqueur, wine, beer, mixer, other. |
| `tags` | Array of strings, max 10 items, each max 30 chars. No duplicates. |
| `status` | One of: `active`, `temporarily_unavailable`, `retired`. |
| `version` | Positive integer ≥ 1 (per-item). Client must send current version in PATCH/DELETE. |
| `updatedAt` | Valid ISO-8601 UTC string. Set by server. |
| `updatedBy` | Non-empty email address. Extracted from Cloudflare Access header. |

### Structural Validation

- Menu must have at least 0 items (can be empty)
- No duplicate item ids within menu
- Menu version is positive integer, incremented on any change
- Timestamps must be valid ISO-8601 UTC
- At least one item with `status: active` is strongly recommended (no hard constraint)

### Automatic Status Updates

- If any required ingredient for a favorite is missing/unavailable in the bartender system, item automatically becomes `temporarily_unavailable` (even if admin set it to `active`)
- Admin can manually override to `active` again, but will auto-revert to temporarily_unavailable if ingredient still missing

### Error Responses

**400 Bad Request** (validation failure):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "primarySpirit",
      "message": "primarySpirit must be one of: vodka, gin, rum, tequila, whiskey, brandy, liqueur, wine, beer, mixer, other"
    },
    {
      "field": "description",
      "message": "Description must not exceed 500 characters"
    }
  ]
}
```

**401 Unauthorized** (Access failure):
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Cloudflare Access authentication required"
}
```

**404 Not Found** (item not found):
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Item 'espresso-martini-1' not found"
}
```

**409 Conflict** (stale version):
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Item version mismatch. You have v1, current is v2. Please refresh and retry."
}
```

---

## 5. Integration with Favorites System

### Bartender.tawiah.net Reference

The menu builder references an **existing favorites/recipes system** at bartender.tawiah.net. Each menu item's `favoriteId` links to a favorite drink.

**Expected Favorite Schema** (pseudo-code):
```
Favorite {
  id: string
  name: string
  ingredients: [{ name, amount, unit }]
  instructions: string
  ...
}
```

**Menu Builder Behavior**:
- On POST /api/menu/items or PATCH, resolve `favoriteId` → fetch favorite from bartender.tawiah.net API
- Validate favorite exists; if not, return 400 error
- Extract ingredient list; check each ingredient against current inventory
- If any required ingredient is missing, auto-set `status: temporarily_unavailable`
- Admin can manually override, but auto-revert if ingredient still missing

**API Call** (Worker → bartender.tawiah.net):
```
GET https://bartender.tawiah.net/api/favorites/{favoriteId}
Response: { id, name, ingredients, ... }
```

---

## 6. Summary Table: Endpoints at a Glance

| Method | Path | Auth | Purpose | Body Required |
|--------|------|------|---------|---------------|
| GET | `/api/menu` | None | Public live menu (active items) | No |
| GET | `/api/menu/admin` | Access | Admin view (all statuses) | No |
| POST | `/api/menu/items` | Access | Add new item | Yes (item) |
| PATCH | `/api/menu/items/{id}` | Access | Update item | Yes (fields + version) |
| DELETE | `/api/menu/items/{id}` | Access | Retire item (soft-delete) | Yes (version) |
| POST | `/api/menu/rollback/{version}` | Access | Restore to snapshot | No |

---

## 7. Phase 1 QA Checklist

- [ ] **Schema finalized**: All item and menu-level fields defined, constraints clear.
- [ ] **Favorites integration scope**: bartender.tawiah.net reference and ingredient availability check designed.
- [ ] **Status-driven visibility**: Active/temporarily_unavailable/retired logic mapped out for both public and admin views.
- [ ] **Optimistic concurrency**: Per-item version field and stale-version rejection confirmed.
- [ ] **Snapshots for rollback**: Immutable versioned snapshots designed (max 10 retained).
- [ ] **Auth simplified**: Cloudflare Access only (no HMAC signatures). Email domains @tawiah.net, @eugenetawiah.com.
- [ ] **No manual ordering**: Items implicitly sorted by primarySpirit group, then alphabetically by name.
- [ ] **Markdown support**: Description field allows bold, italic, line breaks (captured in schema notes).
- [ ] **Soft-delete model**: Retired items hidden from public, preserved in history for rollback.
- [ ] **Primary spirit grouping**: All 11 categories listed in expected display order.
- [ ] **Payload limits**: Max body size 100KB, max 10 tags per item, max 30 chars per tag.
- [ ] **Timestamps**: All ISO-8601 UTC, server-set (not client-provided).

---

## 8. Ready for Phase 2/3

This Phase 1 deliverable is **implementation-ready**. Proceed to:
- **Phase 2**: Cloudflare Access policies, local dev setup, secret handling removed
- **Phase 3**: Implement Worker endpoints with KV integration, validation, favorites API calls

**Simplified from Phase 1 original**: Removed 20% of complexity (HMAC, draft/publish split, manual ordering, audit logs). Focused on single-admin live menu with rollback capability.

All questions answered. ✓
