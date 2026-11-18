import React, { useState, useEffect, memo } from 'react';
import { API_BASE } from '../lib/config';

/**
 * MenuEditor Component with Draft/Publish Workflow
 *
 * Features:
 * - Draft/Publish workflow: save changes without affecting live menu
 * - Preview mode: see draft vs live side-by-side
 * - Add/remove items from menu
 * - Status management: active | temporarily_unavailable | retired
 * - Full edit modal: edit name, description, spirit, status
 * - Automatic sorting by spirit type then alphabetically
 * - Version history and rollback capability
 *
 * Props:
 * - inventory: Array of bartender's current inventory items
 * - customRecipes: Array of custom recipes/favorites
 * - onClose: Callback to close menu editor
 */

const MenuEditor = memo(function MenuEditor({ inventory, customRecipes, onClose, isMobile = false }) {
  const WORKER_URL = API_BASE;

  const SPIRIT_TYPES = [
    'vodka', 'gin', 'rum', 'tequila', 'whiskey', 'brandy',
    'liqueur', 'wine', 'beer', 'mixer', 'other'
  ];

  // State management
  const [draftMenu, setDraftMenu] = useState([]);
  const [liveMenu, setLiveMenu] = useState([]);
  const [liveVersion, setLiveVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editModal, setEditModal] = useState(false);

  // Load menus on mount
  useEffect(() => {
    loadMenus();
    loadSnapshots();
  }, []);

  const loadMenus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${WORKER_URL}/menu/admin`);
      const data = await response.json();

      if (data.source === 'draft') {
        setDraftMenu(data.items || []);
        setHasDraft(true);
        // Still need to load live menu
        const liveResponse = await fetch(`${WORKER_URL}/menu`);
        const liveData = await liveResponse.json();
        setLiveMenu(liveData.items || []);
        setLiveVersion(liveData.version || 0);
      } else {
        setDraftMenu([]);
        setHasDraft(false);
        setLiveMenu(data.items || []);
        setLiveVersion(data.version || 0);
      }
    } catch (error) {
      console.error('Failed to load menus:', error);
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
      return true;
    }

    return recipe.ingredients.every(ingredient => {
      const ingredientName = (ingredient.value || ingredient.name || '').toLowerCase().trim();
      if (!ingredientName) return true;

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
    const menuToUpdate = hasDraft ? draftMenu : liveMenu;
    if (menuToUpdate.some(item => item.id === `menu-${recipe.id}`)) {
      setMessage('Recipe already on menu');
      return;
    }

    const isAvailable = checkIngredientAvailability(recipe.id);
    const primarySpirit = (recipe.primarySpirit || 'other').toLowerCase();

    const newMenuItem = {
      id: `menu-${recipe.id}`,
      favoriteId: recipe.id,
      name: recipe.name,
      description: recipe.menuDescription || recipe.instructions?.substring(0, 100) || '',
      primarySpirit: SPIRIT_TYPES.includes(primarySpirit) ? primarySpirit : 'other',
      tags: recipe.tags ? (Array.isArray(recipe.tags) ? recipe.tags : recipe.tags.split(/[\s,]+/)) : [],
      status: isAvailable ? 'active' : 'temporarily_unavailable',
      version: 1
    };

    const updatedMenu = [...menuToUpdate, newMenuItem];
    const sortedMenu = sortMenu(updatedMenu);

    if (hasDraft) {
      setDraftMenu(sortedMenu);
    } else {
      setDraftMenu(sortedMenu);
      setHasDraft(true);
    }

    setMessage(`Added "${recipe.name}" to draft`);
  };

  const removeFromMenu = (menuId) => {
    const menuToUpdate = hasDraft ? draftMenu : liveMenu;
    const updated = menuToUpdate.filter(item => item.id !== menuId);

    if (hasDraft) {
      setDraftMenu(updated);
    } else {
      setDraftMenu(updated);
      setHasDraft(true);
    }
  };

  const updateMenuItemStatus = (menuId, newStatus) => {
    const menuToUpdate = hasDraft ? draftMenu : liveMenu;
    const updated = menuToUpdate.map(item =>
      item.id === menuId ? { ...item, status: newStatus } : item
    );

    if (hasDraft) {
      setDraftMenu(updated);
    } else {
      setDraftMenu(updated);
      setHasDraft(true);
    }
  };

  const startEditingItem = (item) => {
    setEditingItem({ ...item });
    setEditModal(true);
  };

  const saveEditedItem = () => {
    if (!editingItem) return;

    const menuToUpdate = hasDraft ? draftMenu : liveMenu;
    const updated = menuToUpdate.map(item =>
      item.id === editingItem.id ? editingItem : item
    );

    if (hasDraft) {
      setDraftMenu(updated);
    } else {
      setDraftMenu(updated);
      setHasDraft(true);
    }

    setEditModal(false);
    setEditingItem(null);
    setMessage('Item updated');
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

  const saveDraft = async () => {
    try {
      setSaving(true);
      setMessage('Saving draft...');

      const response = await fetch(`${WORKER_URL}/menu/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: draftMenu
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      setMessage('Draft saved!');
    } catch (error) {
      console.error('Failed to save draft:', error);
      setMessage(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const publishMenu = async () => {
    try {
      setSaving(true);
      setMessage('Publishing...');

      const response = await fetch(`${WORKER_URL}/menu/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: draftMenu,
          version: liveVersion
        })
      });

      const data = await response.json();

      if (response.status === 409) {
        setMessage('The menu was published from another device. Reloading the latest — your draft is kept.');
        const live = await (await fetch(`${WORKER_URL}/menu`)).json();
        setLiveMenu(live.items || []);
        setLiveVersion(live.version || 0);
        return;
      }
      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      // Update local state
      setLiveMenu(draftMenu);
      setLiveVersion(data.version || liveVersion + 1);
      setDraftMenu([]);
      setHasDraft(false);
      setShowPreview(false);
      setMessage(`Published! (v${data.version})`);
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to publish menu:', error);
      setMessage(`Failed to publish: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = async () => {
    if (!window.confirm('Discard draft and return to live menu?')) return;
    try {
      // Also delete the saved draft, or it comes back next time.
      const response = await fetch(`${WORKER_URL}/menu/draft`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setDraftMenu([]);
      setHasDraft(false);
      setMessage('Draft discarded');
    } catch (error) {
      setMessage(`Couldn't discard the saved draft: ${error.message}`);
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

      await loadMenus();
      setDraftMenu([]);
      setHasDraft(false);
      setMessage(`Restored to v${version}`);
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to rollback:', error);
      setMessage(`Failed to rollback: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Phones: one column, full height, room for the bottom tab bar.
  const containerStyle = isMobile
    ? { ...styles.container, flex: 1, maxHeight: 'none', borderRadius: 0, paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }
    : styles.container;

  if (loading) {
    return (
      <div style={containerStyle}>
        <h2>Menu Editor</h2>
        <p>Loading...</p>
      </div>
    );
  }

  const menuToDisplay = hasDraft ? draftMenu : liveMenu;
  const recipesOnMenu = new Set(menuToDisplay.map(item => item.favoriteId));
  const recipesNotOnMenu = customRecipes.filter(r => !recipesOnMenu.has(r.id));

  return (
    <div style={containerStyle}>
      <div style={styles.header}>
        <div>
          <h2>📋 Menu Editor</h2>
          {hasDraft && (
            <div style={{ fontSize: '12px', color: '#FF9800', marginTop: '4px' }}>
              ✏️ DRAFT MODE - Changes not published yet
            </div>
          )}
        </div>
        <button onClick={onClose} style={styles.closeButton} aria-label="Close menu editor">✕</button>
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

      {editModal && editingItem && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3>Edit Menu Item</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Name</label>
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #666', backgroundColor: '#333', color: '#e0e0e0' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Description</label>
              <textarea
                value={editingItem.description}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #666', backgroundColor: '#333', color: '#e0e0e0', minHeight: '60px' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Spirit</label>
              <select
                value={editingItem.primarySpirit}
                onChange={(e) => setEditingItem({ ...editingItem, primarySpirit: e.target.value })}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #666', backgroundColor: '#333', color: '#e0e0e0' }}
              >
                {SPIRIT_TYPES.map(spirit => (
                  <option key={spirit} value={spirit}>{spirit.charAt(0).toUpperCase() + spirit.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Status</label>
              <select
                value={editingItem.status}
                onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #666', backgroundColor: '#333', color: '#e0e0e0' }}
              >
                <option value="active">Active</option>
                <option value="temporarily_unavailable">Unavailable</option>
                <option value="retired">Retired</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={saveEditedItem}
                style={{ flex: 1, padding: '8px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Save
              </button>
              <button
                onClick={() => setEditModal(false)}
                style={{ flex: 1, padding: '8px', backgroundColor: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div style={styles.previewPanel}>
          <h3>Preview: Draft vs Live</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
            <div>
              <h4 style={{ color: '#FF9800' }}>Draft ({draftMenu.length} items)</h4>
              <div style={{ fontSize: '0.9em', maxHeight: '200px', overflow: 'auto', color: '#aaa' }}>
                {draftMenu.map(item => (
                  <div key={item.id} style={{ padding: '4px 0', borderBottom: '1px solid #333' }}>
                    <strong>{item.name}</strong> ({item.primarySpirit})
                    <div style={{ fontSize: '0.8em' }}>{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ color: '#4CAF50' }}>Live ({liveMenu.length} items)</h4>
              <div style={{ fontSize: '0.9em', maxHeight: '200px', overflow: 'auto', color: '#aaa' }}>
                {liveMenu.map(item => (
                  <div key={item.id} style={{ padding: '4px 0', borderBottom: '1px solid #333' }}>
                    <strong>{item.name}</strong> ({item.primarySpirit})
                    <div style={{ fontSize: '0.8em' }}>{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowPreview(false)}
            style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
          >
            Close Preview
          </button>
        </div>
      )}

      <div style={isMobile ? { ...styles.row, gridTemplateColumns: '1fr' } : styles.row}>
        <div style={styles.column}>
          <h3>Available Recipes ({recipesNotOnMenu.length})</h3>
          <div style={styles.recipeList}>
            {recipesNotOnMenu.length === 0 ? (
              <p style={{ color: '#888' }}>All recipes are on the menu!</p>
            ) : (
              recipesNotOnMenu.map(recipe => {
                const isAvailable = checkIngredientAvailability(recipe.id);
                return (
                  <div key={recipe.id} style={{ ...styles.recipeCard, opacity: isAvailable ? 1 : 0.85 }}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.recipeName}>{recipe.name}</div>
                      <div style={styles.recipeDetails}>
                        {!isAvailable && <span style={{ color: '#ff8a80' }}>⚠️ Missing ingredients</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => addRecipeToMenu(recipe)}
                      style={styles.addButton}
                      aria-label={`Add ${recipe.name} to menu`}
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
          <h3>Current Menu ({menuToDisplay.length})</h3>
          <div style={styles.menuList}>
            {menuToDisplay.length === 0 ? (
              <p style={{ color: '#888' }}>Menu is empty. Add recipes above.</p>
            ) : (
              menuToDisplay.map(item => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.menuItemName}>{item.name}</div>
                    <div style={styles.menuItemMeta}>
                      {item.primarySpirit.charAt(0).toUpperCase() + item.primarySpirit.slice(1)}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '4px', fontStyle: 'italic' }}>
                        "{item.description}"
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      onClick={() => startEditingItem(item)}
                      style={{ minHeight: '44px', minWidth: '44px', padding: '8px 12px', backgroundColor: '#1d64c8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                      aria-label={`Edit ${item.name}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeFromMenu(item.id)}
                      style={styles.removeButton}
                      aria-label={`Remove ${item.name} from menu`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={styles.actions}>
        {hasDraft ? (
          <>
            <button
              onClick={saveDraft}
              disabled={saving}
              style={{ ...styles.button, backgroundColor: '#b45309', ...( saving ? styles.buttonDisabled : {}) }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              style={{ ...styles.button, backgroundColor: '#9C27B0' }}
            >
              {showPreview ? 'Hide' : 'Preview'}
            </button>
            <button
              onClick={publishMenu}
              disabled={saving}
              style={{ ...styles.button, backgroundColor: '#2e7d32', ...(saving ? styles.buttonDisabled : {}) }}
            >
              {saving ? 'Publishing...' : 'Publish'}
            </button>
            <button
              onClick={discardDraft}
              style={{ ...styles.button, backgroundColor: '#c62828' }}
            >
              Discard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={saveDraft}
              disabled={saving}
              style={{ ...styles.button, backgroundColor: '#1d64c8', ...(saving ? styles.buttonDisabled : {}) }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          </>
        )}

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
    padding: '0',
    minWidth: '44px',
    minHeight: '44px'
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
    minHeight: '44px',
    padding: '8px 14px',
    backgroundColor: '#2e7d32',
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
    minHeight: '44px',
    minWidth: '44px',
    padding: '8px 12px',
    backgroundColor: '#c62828',
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
    justifyContent: 'center',
    flexWrap: 'wrap'
  },
  button: {
    minHeight: '44px',
    padding: '10px 20px',
    backgroundColor: '#1d64c8',
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
    minHeight: '44px',
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
    minHeight: '44px',
    padding: '8px 14px',
    backgroundColor: '#b45309',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85em'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: '#2a2a3e',
    padding: '20px',
    borderRadius: '8px',
    maxWidth: '500px',
    width: '90%',
    color: '#e0e0e0'
  },
  previewPanel: {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#2a2a3e',
    borderRadius: '6px',
    border: '2px solid #9C27B0'
  }
};

export default MenuEditor;
