import React, { useState, useEffect, memo } from 'react';

/**
 * MenuEditor Component
 *
 * Allows bartender to:
 * - Add custom recipes to the public menu
 * - Reorder menu items by spirit type (vodka, gin, rum, etc.) then alphabetically
 * - Mark items as available/unavailable
 * - Save and publish menu changes
 * - Rollback to previous menu versions
 *
 * Props:
 * - inventory: Array of bartender's current inventory items
 * - customRecipes: Array of custom recipes/favorites created in bartender
 * - onClose: Callback to close menu editor
 */

const MenuEditor = memo(function MenuEditor({ inventory, customRecipes, onClose }) {
  const WORKER_URL = 'https://bartender-api.eugene-tawiah.workers.dev/api';

  const SPIRIT_TYPES = [
    'vodka', 'gin', 'rum', 'tequila', 'whiskey', 'brandy',
    'liqueur', 'wine', 'beer', 'mixer', 'other'
  ];

  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [message, setMessage] = useState('');

  // Load menu on mount
  useEffect(() => {
    loadMenu();
    loadSnapshots();
  }, []);

  const loadMenu = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${WORKER_URL}/menu/admin`);
      const data = await response.json();
      setMenu(data.items || []);
    } catch (error) {
      console.error('Failed to load menu:', error);
      setMessage('Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const loadSnapshots = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/menu/snapshots`);
      const data = await response.json();
      setSnapshots(data.snapshots || []);
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    }
  };

  const checkIngredientAvailability = (recipeId) => {
    const recipe = customRecipes.find(r => r.id === recipeId);
    if (!recipe || !Array.isArray(recipe.ingredients)) {
      return true; // Assume available if no ingredients
    }

    // Check if all ingredients are in inventory with amountRemaining > 0
    return recipe.ingredients.every(ingredient => {
      const ingredientName = (ingredient.value || ingredient.name || '').toLowerCase().trim();
      if (!ingredientName) return true; // Skip empty ingredients

      return inventory.some(invItem => {
        const invName = (invItem.name || '').toLowerCase();
        const amount = parseFloat(invItem.amountRemaining) || 0;
        return amount > 0 && (
          invName.includes(ingredientName) ||
          ingredientName.includes(invName)
        );
      });
    });
  };

  const addRecipeToMenu = (recipe) => {
    // Check if already on menu
    if (menu.some(item => item.id === `menu-${recipe.id}`)) {
      setMessage('Recipe already on menu');
      return;
    }

    const isAvailable = checkIngredientAvailability(recipe.id);
    const primarySpirit = (recipe.primarySpirit || 'other').toLowerCase();

    const newMenuItem = {
      id: `menu-${recipe.id}`,
      favoriteId: recipe.id,
      name: recipe.name,
      description: recipe.menuDescription || recipe.instructions ? recipe.instructions.substring(0, 100) : '',
      primarySpirit: SPIRIT_TYPES.includes(primarySpirit) ? primarySpirit : 'other',
      tags: recipe.tags ? (Array.isArray(recipe.tags) ? recipe.tags : recipe.tags.split(/[\s,]+/)) : [],
      status: isAvailable ? 'active' : 'temporarily_unavailable',
      version: 1
    };

    const updatedMenu = [...menu, newMenuItem];
    const sortedMenu = sortMenu(updatedMenu);
    setMenu(sortedMenu);
    setUnsavedChanges(true);
    setMessage(`Added "${recipe.name}" to menu`);
  };

  const removeFromMenu = (menuId) => {
    setMenu(menu.filter(item => item.id !== menuId));
    setUnsavedChanges(true);
  };

  const updateMenuItemStatus = (menuId, newStatus) => {
    setMenu(menu.map(item =>
      item.id === menuId ? { ...item, status: newStatus } : item
    ));
    setUnsavedChanges(true);
  };

  const sortMenu = (items) => {
    return items.sort((a, b) => {
      const spiritOrderA = SPIRIT_TYPES.indexOf(a.primarySpirit.toLowerCase());
      const spiritOrderB = SPIRIT_TYPES.indexOf(b.primarySpirit.toLowerCase());

      if (spiritOrderA !== spiritOrderB) {
        return spiritOrderA - spiritOrderB;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const saveMenu = async () => {
    try {
      setSaving(true);
      setMessage('Saving menu...');

      const response = await fetch(`${WORKER_URL}/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: menu,
          version: 0 // Let server handle version
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      setUnsavedChanges(false);
      setMessage(`Menu saved! (v${data.version})`);
      await loadSnapshots(); // Refresh snapshot list
    } catch (error) {
      console.error('Failed to save menu:', error);
      setMessage(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const rollbackToSnapshot = async (version) => {
    try {
      setSaving(true);
      setMessage(`Restoring from v${version}...`);

      const response = await fetch(`${WORKER_URL}/menu/rollback/${version}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      await loadMenu();
      setUnsavedChanges(false);
      setMessage(`Restored to v${version}`);
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to rollback:', error);
      setMessage(`Failed to rollback: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h2>Menu Editor</h2>
        <p>Loading...</p>
      </div>
    );
  }

  const recipesOnMenu = new Set(menu.map(item => item.favoriteId));
  const recipesNotOnMenu = customRecipes.filter(r => !recipesOnMenu.has(r.id));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>📋 Menu Editor</h2>
        <button onClick={onClose} style={styles.closeButton}>✕</button>
      </div>

      {message && (
        <div style={{
          padding: '10px',
          marginBottom: '15px',
          backgroundColor: 'rgba(76, 175, 80, 0.2)',
          borderLeft: '3px solid #4CAF50',
          borderRadius: '4px',
          color: '#4CAF50'
        }}>
          {message}
        </div>
      )}

      <div style={styles.row}>
        <div style={styles.column}>
          <h3>Available Recipes ({recipesNotOnMenu.length})</h3>
          <div style={styles.recipeList}>
            {recipesNotOnMenu.length === 0 ? (
              <p style={{ color: '#888' }}>All recipes are on the menu!</p>
            ) : (
              recipesNotOnMenu.map(recipe => {
                const isAvailable = checkIngredientAvailability(recipe.id);
                return (
                  <div key={recipe.id} style={{
                    ...styles.recipeCard,
                    opacity: isAvailable ? 1 : 0.6
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.recipeName}>{recipe.name}</div>
                      <div style={styles.recipeDetails}>
                        {!isAvailable && <span style={{ color: '#f44336' }}>⚠️ Missing ingredients</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => addRecipeToMenu(recipe)}
                      style={styles.addButton}
                    >
                      + Add
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={styles.column}>
          <h3>Current Menu ({menu.length})</h3>
          <div style={styles.menuList}>
            {menu.length === 0 ? (
              <p style={{ color: '#888' }}>Menu is empty. Add recipes above.</p>
            ) : (
              menu.map(item => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.menuItemName}>{item.name}</div>
                    <div style={styles.menuItemMeta}>
                      {item.primarySpirit.charAt(0).toUpperCase() + item.primarySpirit.slice(1)}
                      {item.tags && item.tags.length > 0 && (
                        <span style={{ marginLeft: '10px', fontSize: '0.85em' }}>
                          {item.tags.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '4px', fontStyle: 'italic' }}>
                        "{item.description}"
                      </div>
                    )}
                    <div style={{ fontSize: '0.75em', color: '#666', marginTop: '2px' }}>
                      (from Favorites recipe)
                    </div>
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) => updateMenuItemStatus(item.id, e.target.value)}
                    style={styles.statusSelect}
                  >
                    <option value="active">Active</option>
                    <option value="temporarily_unavailable">Unavailable</option>
                    <option value="retired">Retired</option>
                  </select>
                  <button
                    onClick={() => removeFromMenu(item.id)}
                    style={styles.removeButton}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={styles.actions}>
        <button
          onClick={saveMenu}
          disabled={!unsavedChanges || saving}
          style={{
            ...styles.button,
            ...(!unsavedChanges || saving ? styles.buttonDisabled : {})
          }}
        >
          {saving ? 'Saving...' : 'Save & Publish Menu'}
        </button>

        <button
          onClick={() => setShowSnapshots(!showSnapshots)}
          style={styles.button}
        >
          {showSnapshots ? 'Hide' : 'Show'} Versions ({snapshots.length})
        </button>

        <button
          onClick={onClose}
          style={styles.cancelButton}
        >
          Close
        </button>
      </div>

      {showSnapshots && (
        <div style={styles.snapshotsPanel}>
          <h3>Version History</h3>
          {snapshots.length === 0 ? (
            <p>No previous versions</p>
          ) : (
            <div style={styles.snapshotsList}>
              {snapshots.map(snap => (
                <div key={snap.version} style={styles.snapshotCard}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>v{snap.version}</div>
                    <div style={{ fontSize: '0.9em', color: '#888' }}>
                      {new Date(snap.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => rollbackToSnapshot(snap.version)}
                    disabled={saving}
                    style={styles.rollbackButton}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#1e1e2e',
    color: '#e0e0e0',
    borderRadius: '8px',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid #444'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#e0e0e0',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0'
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px'
  },
  column: {
    display: 'flex',
    flexDirection: 'column'
  },
  recipeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '400px',
    overflow: 'auto'
  },
  recipeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    backgroundColor: '#2a2a3e',
    borderRadius: '6px',
    border: '1px solid #444'
  },
  recipeName: {
    fontWeight: '600',
    marginBottom: '4px'
  },
  recipeDetails: {
    fontSize: '0.85em',
    color: '#aaa'
  },
  addButton: {
    padding: '6px 12px',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9em'
  },
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '400px',
    overflow: 'auto'
  },
  menuCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    backgroundColor: '#2a2a3e',
    borderRadius: '6px',
    border: '1px solid #666'
  },
  menuItemName: {
    fontWeight: '600',
    marginBottom: '4px'
  },
  menuItemMeta: {
    fontSize: '0.85em',
    color: '#aaa'
  },
  statusSelect: {
    padding: '4px 8px',
    backgroundColor: '#333',
    color: '#e0e0e0',
    border: '1px solid #666',
    borderRadius: '4px',
    fontSize: '0.85em'
  },
  removeButton: {
    padding: '4px 8px',
    backgroundColor: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9em'
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
    justifyContent: 'center'
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#2196F3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1em',
    fontWeight: '600'
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#666',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1em'
  },
  snapshotsPanel: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#2a2a3e',
    borderRadius: '6px',
    border: '1px solid #444'
  },
  snapshotsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '250px',
    overflow: 'auto'
  },
  snapshotCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    backgroundColor: '#1e1e2e',
    borderRadius: '4px',
    border: '1px solid #555'
  },
  rollbackButton: {
    padding: '6px 12px',
    backgroundColor: '#FF9800',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85em'
  }
};

export default MenuEditor;
