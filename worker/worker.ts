// Cloudflare Worker - Menu Builder Phase 3 Implementation
// Handles menu management + existing AI bartender endpoints
// All admin endpoints protected by Cloudflare Access

// ============================================================================
// TYPES
// ============================================================================

interface MenuItem {
  id: string;
  favoriteId: string;
  name: string;
  description: string;
  primarySpirit: 'vodka' | 'gin' | 'rum' | 'tequila' | 'whiskey' | 'brandy' | 'liqueur' | 'wine' | 'beer' | 'mixer' | 'other';
  tags: string[];
  status: 'active' | 'temporarily_unavailable' | 'retired';
  version: number;
  updatedAt: string;
  updatedBy: string;
}

interface Menu {
  id: 'menu-primary';
  items: MenuItem[];
  version: number;
  updatedAt: string;
  updatedBy: string;
}

interface ErrorDetail {
  field: string;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  details?: ErrorDetail[];
  message?: string;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ValidationError extends Error {
  status: number;
  details?: ErrorDetail[];
}

/**
 * Favorite/Recipe interface from bartender system (App.jsx custom recipes)
 * Source: App.jsx RecipeBuilder component stores recipes in KV at 'favorites' key
 * Matches the structure: { id, name, ingredients, instructions, glass, garnish, tags, created }
 */
interface Favorite {
  id: string | number;
  name: string;
  ingredients?: Array<{ value: string; amount?: string; unit?: string }>;
  instructions?: string;
  glass?: string;        // Note: App.jsx uses 'glass', not 'glassware'
  garnish?: string;
  tags?: string;         // Comma-separated or space-separated tags
  created?: number;      // Unix timestamp
  [key: string]: any;
}

/**
 * Inventory item interface from bartender system (App.jsx inventory)
 * Source: App.jsx SPIRIT_TYPES and ProgressBar components
 * Stored in KV at 'inventory' key as an array
 */
interface InventoryItem {
  id?: string;
  name: string;
  type?: string;           // e.g., "Vodka", "Gin", "Liqueur", "Garnish", "Tool"
  brand?: string;
  proof?: string;          // e.g., "100" (proof notation)
  bottleSizeMl?: number;   // Total bottle size in milliliters
  amountRemaining?: number; // Current amount remaining in ml
  flavorNotes?: string;
  [key: string]: any;
}

// Cloudflare Worker environment
interface Env {
  BARTENDER_KV: KVNamespace;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_MODEL_VERSATILE?: string;
  ENVIRONMENT?: 'development' | 'production';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SPIRITS_ORDER = ['vodka', 'gin', 'rum', 'tequila', 'whiskey', 'brandy', 'liqueur', 'wine', 'beer', 'mixer', 'other'] as const;
const MAX_BODY_SIZE = 100 * 1024; // 100 KB
const MAX_ITEMS_PER_MENU = 200;
const MAX_TAGS_PER_ITEM = 10;
const MAX_TAG_LENGTH = 30;
const MAX_SNAPSHOTS = 10;
const BARTENDER_API_BASE = 'https://bartender.tawiah.net/api';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sanitizeSecret(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '');
}

function createError(status: number, error: string, message?: string, details?: ErrorDetail[]): ValidationError {
  const err = new Error(message || error) as ValidationError;
  err.status = status;
  err.details = details;
  return err;
}

function jsonResponse<T>(data: SuccessResponse<T> | ErrorResponse, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function normalizeString(value: string): string {
  return value.trim();
}

function validateKebabCase(value: string): boolean {
  return /^[a-z0-9\-]{1,100}$/.test(value);
}

function validatePrimarySpirit(value: string): boolean {
  return SPIRITS_ORDER.includes(value as any);
}

function validateStatus(value: string): boolean {
  return ['active', 'temporarily_unavailable', 'retired'].includes(value);
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeTags(tags: unknown[]): string[] {
  if (!Array.isArray(tags)) return [];
  const normalized = tags
    .map(tag => (typeof tag === 'string' ? normalizeString(tag) : ''))
    .filter(tag => tag.length > 0 && tag.length <= MAX_TAG_LENGTH);
  return [...new Set(normalized)]; // Remove duplicates
}

function sortMenuItems(items: MenuItem[]): MenuItem[] {
  return items.sort((a, b) => {
    const spiritOrder = SPIRITS_ORDER.indexOf(a.primarySpirit) - SPIRITS_ORDER.indexOf(b.primarySpirit);
    if (spiritOrder !== 0) return spiritOrder;
    return a.name.localeCompare(b.name);
  });
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateMenuItem(data: unknown, isUpdate: boolean = false): Omit<MenuItem, 'version' | 'updatedAt' | 'updatedBy'> {
  const details: ErrorDetail[] = [];

  if (typeof data !== 'object' || data === null) {
    throw createError(400, 'Validation failed', 'Request body must be a valid object', [
      { field: 'body', message: 'Must be a JSON object' }
    ]);
  }

  const obj = data as Record<string, unknown>;

  // On create, all fields required; on update, only version required + at least one field to change
  if (!isUpdate) {
    if (typeof obj.id !== 'string') {
      details.push({ field: 'id', message: 'id is required and must be a string' });
    } else if (!validateKebabCase(obj.id)) {
      details.push({ field: 'id', message: 'id must be kebab-case (lowercase, numbers, hyphens only)' });
    }

    if (typeof obj.favoriteId !== 'string') {
      details.push({ field: 'favoriteId', message: 'favoriteId is required and must be a string' });
    } else if (obj.favoriteId.trim().length === 0) {
      details.push({ field: 'favoriteId', message: 'favoriteId cannot be empty' });
    }

    if (typeof obj.name !== 'string') {
      details.push({ field: 'name', message: 'name is required and must be a string' });
    } else if (normalizeString(obj.name).length === 0) {
      details.push({ field: 'name', message: 'name must not be empty' });
    } else if (normalizeString(obj.name).length > 100) {
      details.push({ field: 'name', message: 'name must not exceed 100 characters' });
    }

    if (typeof obj.description !== 'string') {
      details.push({ field: 'description', message: 'description is required and must be a string' });
    } else if (normalizeString(obj.description).length === 0) {
      details.push({ field: 'description', message: 'description must not be empty' });
    } else if (normalizeString(obj.description).length > 500) {
      details.push({ field: 'description', message: 'description must not exceed 500 characters' });
    }

    if (typeof obj.primarySpirit !== 'string') {
      details.push({ field: 'primarySpirit', message: 'primarySpirit is required and must be a string' });
    } else if (!validatePrimarySpirit(obj.primarySpirit)) {
      details.push({
        field: 'primarySpirit',
        message: `primarySpirit must be one of: ${SPIRITS_ORDER.join(', ')}`
      });
    }

    if (typeof obj.status !== 'string') {
      details.push({ field: 'status', message: 'status is required and must be a string' });
    } else if (!validateStatus(obj.status)) {
      details.push({ field: 'status', message: 'status must be: active, temporarily_unavailable, or retired' });
    }
  }

  // Optional on update, required on create
  if (typeof obj.tags !== 'undefined' && obj.tags !== null) {
    if (!Array.isArray(obj.tags)) {
      details.push({ field: 'tags', message: 'tags must be an array of strings' });
    } else if (obj.tags.length > MAX_TAGS_PER_ITEM) {
      details.push({ field: 'tags', message: `tags must not exceed ${MAX_TAGS_PER_ITEM} items` });
    }
  }

  if (details.length > 0) {
    throw createError(400, 'Validation failed', undefined, details);
  }

  return {
    id: normalizeString(obj.id as string),
    favoriteId: normalizeString(obj.favoriteId as string),
    name: normalizeString(obj.name as string),
    description: normalizeString(obj.description as string),
    primarySpirit: obj.primarySpirit as MenuItem['primarySpirit'],
    tags: normalizeTags(obj.tags as unknown[]),
    status: obj.status as MenuItem['status']
  };
}

// ============================================================================
// MENU OPERATIONS
// ============================================================================

async function getMenuLive(kv: KVNamespace): Promise<Menu> {
  const data = await kv.get('menu:live', { type: 'json' });
  if (!data) {
    return {
      id: 'menu-primary',
      items: [],
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system'
    };
  }
  return data as Menu;
}

async function saveMenuLive(kv: KVNamespace, menu: Menu): Promise<void> {
  await kv.put('menu:live', JSON.stringify(menu));
}

async function createSnapshot(kv: KVNamespace, menu: Menu): Promise<void> {
  const snapshotKey = `menu:snapshot:v${menu.version}`;
  await kv.put(snapshotKey, JSON.stringify(menu));

  // Cleanup: prune old snapshots if > MAX_SNAPSHOTS
  // Note: Cloudflare KV doesn't have native list API, so manual pruning isn't automated yet
  // FUTURE: Track snapshot versions in a separate KV key for automatic pruning
  // For now, snapshots are created but not automatically deleted (10-snapshot limit is soft)
}

async function getSnapshot(kv: KVNamespace, version: number): Promise<Menu | null> {
  const data = await kv.get(`menu:snapshot:v${version}`, { type: 'json' });
  return data as Menu | null;
}

// ============================================================================
// BARTENDER API INTEGRATION
// ============================================================================

/**
 * Fetch a favorite drink by ID from the bartender KV store.
 *
 * IMPLEMENTATION DETAILS:
 * - Bartender system (App.jsx) stores custom recipes/favorites in BARTENDER_KV at key 'favorites'
 * - Each favorite is stored with an `id` (string or number from Date.now())
 * - Structure: { id, name, ingredients[], instructions, glass, garnish, tags, created }
 * - This is the SAME favorites array used by the bartender front-end
 *
 * @param favoriteId - The ID of the favorite to fetch (can be string or number)
 * @param kv - Cloudflare KV namespace (BARTENDER_KV)
 * @returns Favorite object or null if not found
 * @throws ValidationError if KV access fails
 */
async function fetchFavorite(
  favoriteId: string | number,
  kv: KVNamespace
): Promise<Favorite | null> {
  try {
    // Get all favorites from KV (same storage as /api/favorites endpoint)
    const favoritesData = await kv.get('favorites', { type: 'json' });
    if (!favoritesData) {
      return null;
    }

    const favorites = Array.isArray(favoritesData) ? favoritesData : [];

    // Find favorite by ID (compare as both string and number for flexibility)
    const favorite = favorites.find((f: Favorite) => {
      const favId = String(f.id);
      const searchId = String(favoriteId);
      return favId === searchId;
    });

    if (!favorite) {
      return null;
    }

    return favorite as Favorite;
  } catch (error) {
    console.error(`Failed to fetch favorite ${favoriteId}:`, error);
    throw createError(500, 'Internal Server Error', 'Failed to verify favorite with bartender system');
  }
}

/**
 * Check if all required ingredients for a favorite are available in current inventory.
 *
 * IMPLEMENTATION DETAILS:
 * - Bartender system (App.jsx) stores inventory in BARTENDER_KV at key 'inventory'
 * - Each inventory item: { name, type, brand, proof, bottleSizeMl, amountRemaining, flavorNotes, ... }
 * - Favorite ingredients: { value: "Vodka", amount: "1.5", unit: "oz" } (from App.jsx RecipeBuilder)
 * - Matching: compare ingredient.value against inventory items (brand+name or type+name patterns)
 * - Available: ingredient found in inventory with amountRemaining > 0
 *
 * @param favorite - The favorite/drink to check ingredients for
 * @param kv - Cloudflare KV namespace (BARTENDER_KV) containing inventory
 * @returns true if all ingredients available, false if any missing or inventory empty
 */
async function checkIngredientAvailability(favorite: Favorite | null, kv: KVNamespace): Promise<boolean> {
  // If no favorite or no ingredients list, assume available (can't verify)
  if (!favorite || !Array.isArray(favorite.ingredients) || favorite.ingredients.length === 0) {
    return true;
  }

  try {
    // Get current inventory from KV (same storage as /api/inventory endpoint)
    const inventoryData = await kv.get('inventory', { type: 'json' });
    const inventory = Array.isArray(inventoryData) ? (inventoryData as InventoryItem[]) : [];

    // If inventory is empty, treat all ingredients as unavailable
    if (inventory.length === 0) {
      return false;
    }

    // Check each ingredient in the favorite
    const allAvailable = favorite.ingredients.every((ingredient) => {
      // App.jsx RecipeBuilder stores ingredient.value as the ingredient name
      const ingredientName = (ingredient.value || '').toLowerCase().trim();
      if (!ingredientName) {
        // Empty ingredient name; skip validation (assume ok)
        return true;
      }

      // Search inventory for matching ingredient
      // Matching strategy: case-insensitive, supports multiple patterns
      const found = inventory.some((invItem: InventoryItem) => {
        const invName = (invItem.name || '').toLowerCase().trim();
        const invBrand = (invItem.brand || '').toLowerCase().trim();
        const invType = (invItem.type || '').toLowerCase().trim();
        const amount = invItem.amountRemaining || 0;

        // Must have remaining amount > 0 to be considered available
        if (amount <= 0) {
          return false;
        }

        // Pattern 1: Exact name or partial match
        // E.g., "Vodka" matches inventory item name "Vodka: Tito's"
        if (invName.includes(ingredientName) || ingredientName.includes(invName)) {
          return true;
        }

        // Pattern 2: Brand match
        // E.g., "Tito's" matches inventory item brand "Tito's"
        if (invBrand && invBrand.includes(ingredientName)) {
          return true;
        }

        // Pattern 3: Type + Brand + Name pattern
        // E.g., "Vodka Tito's" matches type "Vodka", brand "Tito's"
        const typeAndName = [invType, invBrand, invName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (typeAndName.includes(ingredientName)) {
          return true;
        }

        return false;
      });

      return found;
    });

    return allAvailable;
  } catch (error) {
    console.error(`Failed to check ingredient availability:`, error);
    // On error, assume unavailable to be safe (don't serve drink if we can't verify ingredients)
    return false;
  }
}

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

async function handleGetMenu(kv: KVNamespace): Promise<Response> {
  try {
    const menu = await getMenuLive(kv);

    // Filter to active items, but also verify ingredients are available
    const filtered: typeof menu.items = [];
    for (const item of menu.items) {
      if (item.status !== 'active') {
        continue;
      }

      // Verify ingredients are still available in bartender inventory
      const favorite = await fetchFavorite(item.favoriteId, kv);
      const ingredientsAvailable = await checkIngredientAvailability(favorite, kv);

      if (ingredientsAvailable) {
        filtered.push(item);
      }
    }

    // Map to public response shape (exclude internal fields)
    const publicItems = filtered.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      primarySpirit: item.primarySpirit,
      tags: item.tags,
      status: item.status
    }));

    const sorted = sortMenuItems(publicItems as any);

    return jsonResponse({
      success: true,
      data: {
        id: menu.id,
        items: sorted,
        version: menu.version,
        updatedAt: menu.updatedAt
      }
    });
  } catch (error) {
    console.error('Failed to get menu:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch menu from KV'
      },
      500
    );
  }
}

async function handleGetMenuAdmin(kv: KVNamespace, userEmail: string): Promise<Response> {
  try {
    const menu = await getMenuLive(kv);
    const sorted = sortMenuItems(menu.items);

    return jsonResponse({
      success: true,
      data: {
        ...menu,
        items: sorted
      }
    });
  } catch (error) {
    console.error('Failed to get menu for admin:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch menu'
      },
      500
    );
  }
}

async function handlePostMenuItem(kv: KVNamespace, userEmail: string, body: unknown): Promise<Response> {
  try {
    const validated = validateMenuItem(body);

    // Check favorite exists in bartender system
    const favorite = await fetchFavorite(validated.favoriteId, kv);
    if (!favorite) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [
            {
              field: 'favoriteId',
              message: `Favorite '${validated.favoriteId}' not found in bartender.tawiah.net`
            }
          ]
        },
        400
      );
    }

    // Check ingredient availability
    const ingredientsAvailable = await checkIngredientAvailability(favorite, kv);
    const status = ingredientsAvailable ? validated.status : 'temporarily_unavailable';

    const menu = await getMenuLive(kv);

    // Check ID uniqueness
    if (menu.items.some(item => item.id === validated.id)) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [
            {
              field: 'id',
              message: `Item with id '${validated.id}' already exists`
            }
          ]
        },
        400
      );
    }

    // Check menu size
    if (menu.items.length >= MAX_ITEMS_PER_MENU) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [
            {
              field: 'items',
              message: `Menu already has maximum of ${MAX_ITEMS_PER_MENU} items`
            }
          ]
        },
        400
      );
    }

    const now = new Date().toISOString();
    const newItem: MenuItem = {
      ...validated,
      status,
      version: 1,
      updatedAt: now,
      updatedBy: userEmail
    };

    menu.items.push(newItem);
    menu.version += 1;
    menu.updatedAt = now;
    menu.updatedBy = userEmail;

    await saveMenuLive(kv, menu);
    await createSnapshot(kv, menu);

    return jsonResponse(
      {
        success: true,
        data: {
          message: 'Item added successfully',
          id: newItem.id,
          version: newItem.version,
          menuVersion: menu.version,
          updatedAt: now
        }
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const validError = error as ValidationError;
      return jsonResponse(
        {
          success: false,
          error: validError.message || 'Error',
          details: validError.details
        },
        validError.status
      );
    }
    console.error('Failed to add menu item:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to add item'
      },
      500
    );
  }
}

async function handlePatchMenuItem(
  kv: KVNamespace,
  userEmail: string,
  itemId: string,
  body: unknown
): Promise<Response> {
  try {
    if (typeof body !== 'object' || body === null) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [{ field: 'body', message: 'Request body must be a JSON object' }]
        },
        400
      );
    }

    const obj = body as Record<string, unknown>;

    // Version is required for optimistic concurrency
    if (typeof obj.version !== 'number' || obj.version < 1) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [{ field: 'version', message: 'version is required and must be a positive integer' }]
        },
        400
      );
    }

    const menu = await getMenuLive(kv);
    const itemIndex = menu.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      return jsonResponse(
        {
          success: false,
          error: 'Not Found',
          message: `Item '${itemId}' not found`
        },
        404
      );
    }

    const currentItem = menu.items[itemIndex];

    // Optimistic concurrency control
    if (currentItem.version !== obj.version) {
      return jsonResponse(
        {
          success: false,
          error: 'Conflict',
          message: `Item version mismatch. You provided v${obj.version}, but current is v${currentItem.version}. Please refresh and retry.`
        },
        409
      );
    }

    // Build update object - only include fields that were provided
    const updates: Partial<MenuItem> = {};

    if (typeof obj.name === 'string') {
      const normalized = normalizeString(obj.name);
      if (normalized.length === 0 || normalized.length > 100) {
        return jsonResponse(
          {
            success: false,
            error: 'Validation failed',
            details: [{ field: 'name', message: 'name must be 1-100 characters' }]
          },
          400
        );
      }
      updates.name = normalized;
    }

    if (typeof obj.description === 'string') {
      const normalized = normalizeString(obj.description);
      if (normalized.length === 0 || normalized.length > 500) {
        return jsonResponse(
          {
            success: false,
            error: 'Validation failed',
            details: [{ field: 'description', message: 'description must be 1-500 characters' }]
          },
          400
        );
      }
      updates.description = normalized;
    }

    if (typeof obj.primarySpirit === 'string') {
      if (!validatePrimarySpirit(obj.primarySpirit)) {
        return jsonResponse(
          {
            success: false,
            error: 'Validation failed',
            details: [
              {
                field: 'primarySpirit',
                message: `primarySpirit must be one of: ${SPIRITS_ORDER.join(', ')}`
              }
            ]
          },
          400
        );
      }
      updates.primarySpirit = obj.primarySpirit as MenuItem['primarySpirit'];
    }

    if (typeof obj.status === 'string') {
      if (!validateStatus(obj.status)) {
        return jsonResponse(
          {
            success: false,
            error: 'Validation failed',
            details: [
              {
                field: 'status',
                message: 'status must be: active, temporarily_unavailable, or retired'
              }
            ]
          },
          400
        );
      }
      updates.status = obj.status as MenuItem['status'];
    }

    if (typeof obj.tags !== 'undefined') {
      if (obj.tags !== null && !Array.isArray(obj.tags)) {
        return jsonResponse(
          {
            success: false,
            error: 'Validation failed',
            details: [{ field: 'tags', message: 'tags must be an array' }]
          },
          400
        );
      }
      updates.tags = normalizeTags(obj.tags as unknown[]);
    }

    // Check ingredient availability if updating
    if (updates.status === 'active' || !updates.status) {
      const favorite = await fetchFavorite(currentItem.favoriteId, kv);
      if (favorite) {
        const ingredientsAvailable = await checkIngredientAvailability(favorite, kv);
        if (!ingredientsAvailable && (!updates.status || updates.status === 'active')) {
          updates.status = 'temporarily_unavailable';
        }
      }
    }

    const now = new Date().toISOString();
    const updatedItem: MenuItem = {
      ...currentItem,
      ...updates,
      version: currentItem.version + 1,
      updatedAt: now,
      updatedBy: userEmail
    };

    menu.items[itemIndex] = updatedItem;
    menu.version += 1;
    menu.updatedAt = now;
    menu.updatedBy = userEmail;

    await saveMenuLive(kv, menu);
    await createSnapshot(kv, menu);

    return jsonResponse(
      {
        success: true,
        data: {
          message: 'Item updated successfully',
          id: updatedItem.id,
          version: updatedItem.version,
          menuVersion: menu.version,
          updatedAt: now
        }
      },
      200
    );
  } catch (error) {
    console.error('Failed to update menu item:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to update item'
      },
      500
    );
  }
}

async function handleDeleteMenuItem(
  kv: KVNamespace,
  userEmail: string,
  itemId: string,
  body: unknown
): Promise<Response> {
  try {
    if (typeof body !== 'object' || body === null) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [{ field: 'body', message: 'Request body must be a JSON object' }]
        },
        400
      );
    }

    const obj = body as Record<string, unknown>;

    if (typeof obj.version !== 'number' || obj.version < 1) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [{ field: 'version', message: 'version is required and must be a positive integer' }]
        },
        400
      );
    }

    const menu = await getMenuLive(kv);
    const itemIndex = menu.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      return jsonResponse(
        {
          success: false,
          error: 'Not Found',
          message: `Item '${itemId}' not found`
        },
        404
      );
    }

    const currentItem = menu.items[itemIndex];

    if (currentItem.version !== obj.version) {
      return jsonResponse(
        {
          success: false,
          error: 'Conflict',
          message: `Item version mismatch. You provided v${obj.version}, but current is v${currentItem.version}. Please refresh and retry.`
        },
        409
      );
    }

    const now = new Date().toISOString();
    const retiredItem: MenuItem = {
      ...currentItem,
      status: 'retired',
      version: currentItem.version + 1,
      updatedAt: now,
      updatedBy: userEmail
    };

    menu.items[itemIndex] = retiredItem;
    menu.version += 1;
    menu.updatedAt = now;
    menu.updatedBy = userEmail;

    await saveMenuLive(kv, menu);
    await createSnapshot(kv, menu);

    return jsonResponse(
      {
        success: true,
        data: {
          message: 'Item retired successfully',
          id: retiredItem.id,
          menuVersion: menu.version
        }
      },
      200
    );
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to retire item'
      },
      500
    );
  }
}

async function handleRollback(
  kv: KVNamespace,
  userEmail: string,
  version: number
): Promise<Response> {
  try {
    const snapshot = await getSnapshot(kv, version);
    if (!snapshot) {
      return jsonResponse(
        {
          success: false,
          error: 'Not Found',
          message: `Snapshot version ${version} not found`
        },
        404
      );
    }

    const currentMenu = await getMenuLive(kv);

    if (version >= currentMenu.version) {
      return jsonResponse(
        {
          success: false,
          error: 'Validation failed',
          details: [
            {
              field: 'version',
              message: `Cannot rollback to version ${version}; current is ${currentMenu.version}. You can only rollback to older versions.`
            }
          ]
        },
        400
      );
    }

    const now = new Date().toISOString();
    const newMenu: Menu = {
      ...snapshot,
      version: currentMenu.version + 1,
      updatedAt: now,
      updatedBy: userEmail
    };

    await saveMenuLive(kv, newMenu);
    await createSnapshot(kv, newMenu);

    return jsonResponse(
      {
        success: true,
        data: {
          message: `Menu rolled back to version ${version}`,
          fromVersion: currentMenu.version,
          toVersion: newMenu.version,
          updatedAt: now
        }
      },
      200
    );
  } catch (error) {
    console.error('Failed to rollback menu:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to rollback menu'
      },
      500
    );
  }
}

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

function getAuthenticatedEmail(request: Request): string | null {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!email || !validateEmail(email)) {
    return null;
  }
  return email;
}

function requireAuth(request: Request): string {
  const email = getAuthenticatedEmail(request);
  if (!email) {
    throw createError(401, 'Unauthorized', 'Access authentication required');
  }
  return email;
}

// ============================================================================
// MAIN WORKER
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Size limit check
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return jsonResponse(
        {
          success: false,
          error: 'Payload Too Large',
          message: 'Request body exceeds 100 KB limit'
        },
        413
      );
    }

    try {
      // =====================================================================
      // MENU BUILDER ENDPOINTS
      // =====================================================================

      // GET /api/menu - Public: Get active menu items only
      if (pathname === '/api/menu' && request.method === 'GET') {
        return await handleGetMenu(env.BARTENDER_KV);
      }

      // GET /api/menu/admin - Admin: Get all menu items (requires Access auth)
      if (pathname === '/api/menu/admin' && request.method === 'GET') {
        const userEmail = requireAuth(request);
        return await handleGetMenuAdmin(env.BARTENDER_KV, userEmail);
      }

      // POST /api/menu/items - Admin: Add new item (requires Access auth)
      if (pathname === '/api/menu/items' && request.method === 'POST') {
        const userEmail = requireAuth(request);
        const body = await request.json();
        return await handlePostMenuItem(env.BARTENDER_KV, userEmail, body);
      }

      // PATCH /api/menu/items/{id} - Admin: Update item (requires Access auth)
      const patchItemMatch = pathname.match(/^\/api\/menu\/items\/([a-z0-9\-]+)$/);
      if (patchItemMatch && request.method === 'PATCH') {
        const userEmail = requireAuth(request);
        const itemId = patchItemMatch[1];
        const body = await request.json();
        return await handlePatchMenuItem(env.BARTENDER_KV, userEmail, itemId, body);
      }

      // DELETE /api/menu/items/{id} - Admin: Retire item (soft-delete)
      const deleteItemMatch = pathname.match(/^\/api\/menu\/items\/([a-z0-9\-]+)$/);
      if (deleteItemMatch && request.method === 'DELETE') {
        const userEmail = requireAuth(request);
        const itemId = deleteItemMatch[1];
        const body = await request.json();
        return await handleDeleteMenuItem(env.BARTENDER_KV, userEmail, itemId, body);
      }

      // POST /api/menu/rollback/{version} - Admin: Rollback to snapshot
      const rollbackMatch = pathname.match(/^\/api\/menu\/rollback\/(\d+)$/);
      if (rollbackMatch && request.method === 'POST') {
        const userEmail = requireAuth(request);
        const version = parseInt(rollbackMatch[1], 10);
        return await handleRollback(env.BARTENDER_KV, userEmail, version);
      }

      // =====================================================================
      // EXISTING BARTENDER ENDPOINTS (from original worker)
      // =====================================================================

      // GET /api/inventory
      if (pathname === '/api/inventory' && request.method === 'GET') {
        const inventory = await env.BARTENDER_KV.get('inventory', { type: 'json' }) || [];
        return new Response(JSON.stringify({ inventory }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /api/inventory
      if (pathname === '/api/inventory' && request.method === 'POST') {
        const { inventory } = await request.json();
        await env.BARTENDER_KV.put('inventory', JSON.stringify(inventory));
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Additional bartender endpoints would go here (chat, recipes, favorites, etc.)
      // For now, returning 404 for unmapped endpoints

      return jsonResponse(
        {
          success: false,
          error: 'Not Found',
          message: 'Endpoint not found'
        },
        404
      );
    } catch (error) {
      console.error('Worker error:', error);

      if (error instanceof Error && 'status' in error) {
        const validError = error as ValidationError;
        return jsonResponse(
          {
            success: false,
            error: validError.message || 'Error',
            details: validError.details
          },
          validError.status
        );
      }

      return jsonResponse(
        {
          success: false,
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        },
        500
      );
    }
  }
};
