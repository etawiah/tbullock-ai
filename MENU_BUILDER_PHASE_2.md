# Menu Builder - Phase 2 Deliverable
## Security Scaffolding & Configuration

**Status**: Setup & specification for Phase 2 (Revised)
**Date**: 2025-01-27 | Revised: 2025-11-30
**Scope**: Cloudflare Access policies, local dev setup, request validation schema, QA procedures (no implementation code yet)

---

## REVISIONS (Nov 30, 2025)

**Major Simplifications**:
- **Removed**: HMAC-SHA256 signature scheme, shared secrets, x-admin-signature headers, timing-safe comparison
- **Removed**: Secret rotation, local .env.local setup for secrets
- **Simplified**: Auth is **Cloudflare Access only**. Single email domain allowlist (@tawiah.net, @eugenetawiah.com)
- **Removed**: Audit log section (no complex newline-delimited JSON logging)
- **Kept**: Request validation schema, body size limits, error response standardization, QA checklists
- **Updated**: All auth references now point to Access JWT headers only

---

## 1. Cloudflare Access Policy Setup

### Policy Configuration: Admin Routes

**Objective**: Protect all admin endpoints (`/api/menu/*` excluding `/api/menu` public GET) behind Cloudflare Access.

#### Single Policy: Menu Builder Admin

**Policy Name**: `Menu Builder Admin`
**Scope**: Cloudflare Workers routes + Pages routes (if admin UI built later)
**Rules**:
- **Path Match**:
  - `/api/menu/admin`
  - `/api/menu/items` (POST, PATCH, DELETE)
  - `/api/menu/rollback/*` (POST)
- **Method Match**: GET, POST, PATCH, DELETE
- **Auth Required**: Yes

**Access Policy Details**:
```
Application: Menu Builder Admin (Cloudflare Access)
  Subdomain: admin.ai-bartender.pages.dev
  Team Domain: (your Cloudflare team domain)

Policy: Admin Access
  Rule Type: Allow
  Action: Allow

  Include (ANY of):
    - Email domains
      - List: [tawiah.net, eugenetawiah.com]

  Require (ALL of):
    - (optional) Device Posture: Require Trusted Device

  Session Duration: 12 hours (or your preference)
```

**Implementation Steps**:
1. Log into Cloudflare Dashboard
2. Go to `Access → Applications → Create Application`
3. Select `Self-hosted`
4. Name: `Menu Builder Admin`
5. Subdomain: `admin` (creates `admin.ai-bartender.pages.dev`)
6. Domain: `ai-bartender.pages.dev`
7. Create policy with rules above
8. Configure identity provider (Google, GitHub, or email magic link)
9. Note the **Team Domain** for local testing

**Expected Behavior**:
- Anonymous requests to `/api/menu/admin` → 403 Forbidden (browser sees login prompt)
- Authenticated requests (email authenticated via Access) → forwarded to Worker
- Worker receives headers:
  ```
  Cf-Access-Jwt-Assertion: <JWT token signed by Cloudflare>
  Cf-Access-Authenticated-User-Email: alex@tawiah.net
  Cf-Access-Authenticated-User-Id: <unique-id>
  ```

---

## 2. Cloudflare Access Headers

When Access grants a request, the Worker receives:

```
Cf-Access-Jwt-Assertion: <JWT token>
Cf-Access-Authenticated-User-Email: user@tawiah.net
Cf-Access-Authenticated-User-Id: <user-id>
```

**JWT Payload Example** (decoded, for reference):
```json
{
  "aud": "your-application-id",
  "email": "user@tawiah.net",
  "identity": "user@tawiah.net",
  "iat": 1674850200,
  "exp": 1674853800,
  "iss": "https://yourdomain.cloudflareaccess.com"
}
```

**Worker will use**:
- `Cf-Access-Authenticated-User-Email` header to extract admin email for `updatedBy` tracking
- `Cf-Access-Jwt-Assertion` for future JWT validation if enhanced security is needed (Phase 6+)

**No custom signature validation needed**. Access JWT is signed by Cloudflare; we trust Cloudflare's infrastructure.

---

## 3. Request Validation Schema

### JSON Schema Definition

**POST /api/menu/items** (Add new item):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Menu Item Create Request",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9\\-]{1,100}$",
      "description": "Item ID (kebab-case, unique within menu)"
    },
    "favoriteId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Reference to favorite/drink in bartender.tawiah.net"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Display name (will be trimmed)"
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Ingredients/instructions. Markdown allowed (bold, italic, line breaks)."
    },
    "primarySpirit": {
      "type": "string",
      "enum": ["vodka", "gin", "rum", "tequila", "whiskey", "brandy", "liqueur", "wine", "beer", "mixer", "other"],
      "description": "Spirit category"
    },
    "tags": {
      "type": "array",
      "maxItems": 10,
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 30
      },
      "description": "UI tags (e.g., signature, spicy, new)"
    },
    "status": {
      "type": "string",
      "enum": ["active", "temporarily_unavailable", "retired"],
      "description": "Item status"
    }
  },
  "required": ["id", "favoriteId", "name", "description", "primarySpirit", "status"],
  "additionalProperties": false
}
```

**PATCH /api/menu/items/{id}** (Update item):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Menu Item Update Request",
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
    "description": { "type": "string", "minLength": 1, "maxLength": 500 },
    "primarySpirit": {
      "type": "string",
      "enum": ["vodka", "gin", "rum", "tequila", "whiskey", "brandy", "liqueur", "wine", "beer", "mixer", "other"]
    },
    "tags": {
      "type": "array",
      "maxItems": 10,
      "items": { "type": "string", "minLength": 1, "maxLength": 30 }
    },
    "status": {
      "type": "string",
      "enum": ["active", "temporarily_unavailable", "retired"]
    },
    "version": {
      "type": "integer",
      "minimum": 1,
      "description": "Client must send current item version for optimistic concurrency"
    }
  },
  "required": ["version"],
  "additionalProperties": false
}
```

**DELETE /api/menu/items/{id}** (Retire item):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Menu Item Delete Request",
  "type": "object",
  "properties": {
    "version": {
      "type": "integer",
      "minimum": 1,
      "description": "Current item version"
    }
  },
  "required": ["version"],
  "additionalProperties": false
}
```

### Validation Library Options (Phase 3)

- **AJV** (async JSON validator) — most performant
  ```bash
  npm install ajv
  ```
- **Zod** — TypeScript-friendly runtime schema
  ```bash
  npm install zod
  ```
- **Manual validation** — custom logic (minimal dependencies)

**Recommendation**: Use AJV or Zod. Manual validation is error-prone.

---

### Validation Checks (Beyond Schema)

| Check | Type | Action |
|-------|------|--------|
| Body size > 100KB | Pre-validation | Return 413 Payload Too Large |
| Missing Access header | Auth | Return 401 Unauthorized |
| JSON parse error | Parse | Return 400 Bad Request |
| Schema validation fail | Schema | Return 400 Bad Request + details |
| Item ID not unique in menu | Logic | Return 400 Bad Request |
| favoriteId not found in bartender system | Logic | Return 400 Bad Request |
| Required ingredient missing | Logic | Return 400 Bad Request (with suggestion to set status: temporarily_unavailable) or auto-set status |
| Item version mismatch (PATCH/DELETE) | Concurrency | Return 409 Conflict |
| Item not found (PATCH/DELETE) | Logic | Return 404 Not Found |
| Snapshot version not found (rollback) | Logic | Return 404 Not Found |

---

### Normalization Rules (Applied Before Saving)

| Field | Rule |
|-------|------|
| `name` | Trim leading/trailing whitespace |
| `description` | Trim leading/trailing whitespace. Preserve internal newlines and markdown. |
| `id` | No changes (must already be valid kebab-case) |
| `primarySpirit` | No changes (enum validates) |
| `status` | No changes (enum validates) |
| `tags` | Remove duplicates. Trim each tag. |

---

## 4. Request Size Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max body size | 100 KB | Reasonable for menu item JSON |
| Max items in menu | 200 | Practical for bar menu |
| Max tags per item | 10 | UI reasonable |
| Max tag length | 30 chars | Display width |
| Max name length | 100 chars | UI field width |
| Max description length | 500 chars | Readable in UI |

**Enforcement** (Worker code, Phase 3):
```javascript
const body = await request.text();
if (body.length > 100 * 1024) {
  return new Response(
    JSON.stringify({ success: false, error: "Payload too large" }),
    { status: 413, headers: { 'Content-Type': 'application/json' } }
  );
}
```

---

## 5. Error Response Standardization

### HTTP Status Codes

| Status | Scenario | Example |
|--------|----------|---------|
| 200 | Success | Item added, updated, deleted, rolled back |
| 400 | Bad request (validation, logic) | Invalid schema, missing favorite, duplicate ID |
| 401 | Missing auth (no Access JWT header) | Unauthenticated request to /api/menu/admin |
| 404 | Not found | Item not found, snapshot version not found |
| 409 | Conflict (stale version) | Client version doesn't match current item version |
| 413 | Payload too large | Body > 100 KB |
| 500 | Server error (KV, external API) | KV read/write failure, bartender API unavailable |

### Error Response Format

**Validation Error** (400):
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

**Favorite Not Found** (400):
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "favoriteId",
      "message": "Favorite 'unknown-drink' not found in bartender.tawiah.net"
    }
  ]
}
```

**Unauthorized** (401):
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Access authentication required"
}
```

**Not Found** (404):
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Item 'espresso-martini-1' not found"
}
```

**Conflict / Stale Version** (409):
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Item version mismatch. You provided v1, but current is v2. Please refresh and retry."
}
```

**Server Error** (500):
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Failed to fetch menu from KV"
}
```

---

## 6. Bartender.tawiah.net Integration

### Expected API Contract

The menu builder will call bartender.tawiah.net to resolve favorites and check ingredient availability.

**Endpoint**: `GET https://bartender.tawiah.net/api/favorites/{favoriteId}`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "id": "espresso-martini",
    "name": "Espresso Martini",
    "ingredients": [
      { "name": "Vodka", "amount": 1.5, "unit": "oz" },
      { "name": "Kahlúa", "amount": 0.5, "unit": "oz" },
      { "name": "Fresh Espresso", "amount": 1, "unit": "oz" }
    ],
    "instructions": "Shake over ice...",
    "isFavorite": true
  }
}
```

**Validation in Menu Builder**:
1. Fetch favorite by favoriteId
2. If 404 or error, return 400 (favorite not found)
3. Extract ingredients list
4. For each ingredient, check if it exists in current bartender inventory (assume separate inventory API)
5. If any required ingredient missing, auto-set item `status: "temporarily_unavailable"`

### Cross-System Availability

The menu item's `status` field is **not authoritative**. On each GET /api/menu request:
1. Filter to items with `status: active`
2. For each active item, fetch the referenced favorite
3. Check if all ingredients are available in current inventory
4. If any missing, treat item as if it's `temporarily_unavailable` (hide from public)
5. Return only items with both conditions met

This ensures the public menu never shows drinks with missing ingredients, even if admin marked them as active.

---

## 7. Phase 2 QA Checklist

### Cloudflare Access Verification

- [ ] **Access policy created**: `Menu Builder Admin` policy exists in Cloudflare dashboard
- [ ] **Auth enforced**: Anonymous GET /api/menu/admin returns 403 (or Access login challenge in browser)
- [ ] **Authenticated access works**: Logged-in user (@tawiah.net or @eugenetawiah.com email) can reach /api/menu/admin
- [ ] **Email in header**: `Cf-Access-Authenticated-User-Email` header present in authenticated requests
- [ ] **Scope isolation**: Public route (`GET /api/menu`) NOT behind Access, accessible to anyone

### Request Validation Spec

- [ ] **JSON schemas defined**: All request bodies have full schema definitions
- [ ] **Validation order confirmed**: Size limit → parse → schema → logic checks
- [ ] **Error format standardized**: All 400/401/404/409/413/500 errors have consistent shape
- [ ] **Normalization rules locked in**: Trim whitespace, remove tag duplicates, preserve markdown
- [ ] **Size limits agreed**: 100 KB max body, 200 items per menu, 10 tags per item

### Integration Readiness

- [ ] **Access JWT available in Worker**: Can extract email from `Cf-Access-Authenticated-User-Email` header
- [ ] **Bartender API contract known**: Favorite schema, ingredient availability API defined
- [ ] **Optimistic concurrency defined**: Per-item version field for PATCH/DELETE requests
- [ ] **Snapshot rollback spec**: Max 10 snapshots, oldest pruned on new saves
- [ ] **Error responses logged**: All rejections return consistent JSON error shape

---

## 8. Developer Runbook: Local Setup

### Prerequisites
- Wrangler CLI installed
- Cloudflare account with Access enabled
- Node.js 18+
- (No shared secrets or API keys needed for local auth testing—Access is Cloudflare-managed)

### Local Development Setup

**Step 1: Start Worker Locally**
```bash
npm run worker:dev
# Starts at http://localhost:8787
# Note: Access auth won't work locally (requires Cloudflare tunnel). Skip auth checks for local testing.
```

**Step 2: Test Public Endpoint (No Auth)**
```bash
curl http://localhost:8787/api/menu
# Expected: 200 with menu data (or empty items if KV empty)
```

**Step 3: Test Admin Endpoint (No Auth, Should Fail Locally)**
```bash
curl -X GET http://localhost:8787/api/menu/admin
# Expected: 401 Unauthorized (no Access header in local dev)
# This is normal. For local testing, either:
#   - Skip auth checks in development mode, or
#   - Use Cloudflare tunnel to test through Access
```

**Step 4: Test with Fake Access Header (Simulating Auth)**
```bash
curl -X GET http://localhost:8787/api/menu/admin \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net"
# Expected: 200 with menu data (if you've disabled auth checks for local dev)
```

**Step 5: Test Item Creation (POST)**
```bash
curl -X POST http://localhost:8787/api/menu/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Authenticated-User-Email: alex@tawiah.net" \
  -d '{
    "id": "test-drink-1",
    "favoriteId": "espresso-martini",
    "name": "Test Drink",
    "description": "A test drink",
    "primarySpirit": "vodka",
    "status": "active"
  }'
# Expected: 200 with item created (if local auth is bypassed)
```

### Local Auth Workaround

For local development (since Access won't work without Cloudflare tunnel):

**Option A: Disable auth checks in development mode**
```javascript
// worker/worker.js
const isLocalDev = env.ENVIRONMENT === 'development';

if (!isLocalDev) {
  // Check Access header in production
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!email) return new Response('Unauthorized', { status: 401 });
}
```

**Option B: Use Cloudflare tunnel for local Access testing**
```bash
wrangler tunnel create
# Creates a tunnel to your local worker for access through Cloudflare
```

---

## 9. Production Deployment Checklist

Before deploying Phase 3 code:

- [ ] **Cloudflare Access policy live and tested**: Policy created, identity provider configured, emails in allowlist
- [ ] **Worker routes protected**: All admin routes (except `/api/menu`) have Access policy applied
- [ ] **Access headers available**: Verify `Cf-Access-Authenticated-User-Email` in logs of live requests
- [ ] **Runbook documented and tested**: Local setup guide reviewed with team
- [ ] **Bartender API contract confirmed**: Favorite endpoint URL, schema, ingredient availability API defined
- [ ] **KV namespace created**: `BARTENDER_KV` namespace exists in Cloudflare
- [ ] **Error responses standardized**: All error cases return consistent JSON shape

---

## 10. Next: Phase 3 Ready

All security scaffolding and configuration **specified**.

Phase 3 will implement:
1. Worker code to verify Access JWT header (simple presence check)
2. JSON schema validation (AJV or Zod)
3. KV operations (read/write/snapshot management)
4. Bartender API calls (fetch favorite, check ingredients)
5. Per-item versioning and optimistic concurrency control
6. All error handling with proper status codes
7. Snapshot creation and rollback logic

**No code written yet — all specification complete.** ✓
