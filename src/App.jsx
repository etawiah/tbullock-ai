import { useState, useEffect, useRef } from 'react'

// Unit conversion utilities
const ozToMl = (oz) => oz * 29.5735
const lToMl = (l) => l * 1000
const mlToOz = (ml) => ml / 29.5735
const mlToL = (ml) => ml / 1000

const convertToMl = (value, unit) => {
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  if (unit === 'oz') return String(Math.round(ozToMl(num) * 100) / 100)
  if (unit === 'L') return String(Math.round(lToMl(num) * 100) / 100)
  return String(num)
}

const convertFromMl = (mlValue, targetUnit) => {
  const ml = parseFloat(mlValue)
  if (isNaN(ml)) return ''
  if (targetUnit === 'oz') return String(Math.round(mlToOz(ml) * 100) / 100)
  if (targetUnit === 'L') return String(Math.round(mlToL(ml) * 1000) / 1000)
  return String(ml)
}

// Progress Bar Component for Bottle Fill Levels
function ProgressBar({ current, total }) {
  const percentage = total > 0 ? Math.min(100, (current / total) * 100) : 0

  // Color coding: green (>50%), yellow (25-50%), red (<25%)
  let barColor = '#10b981' // green
  if (percentage < 25) barColor = '#ef4444' // red
  else if (percentage < 50) barColor = '#f59e0b' // yellow

  return (
    <div style={{
      width: '100%',
      height: '8px',
      background: '#e5e7eb',
      borderRadius: '4px',
      overflow: 'hidden',
      marginTop: '4px'
    }}>
      <div style={{
        width: `${percentage}%`,
        height: '100%',
        background: barColor,
        transition: 'width 0.3s ease, background 0.3s ease'
      }} />
    </div>
  )
}

// Helper function to check if item should show progress/stock indicators
const shouldShowProgress = (itemType) => {
  const noProgressTypes = ['other', 'garnish', 'tool', 'bitters']
  return !noProgressTypes.includes((itemType || '').toLowerCase())
}

// Helper function to determine stock level
const getStockLevel = (current, total) => {
  const percentage = total > 0 ? (current / total) * 100 : 0
  if (percentage < 10) return { level: 'critical', label: '🔴 Critical', color: '#dc2626' }
  if (percentage < 25) return { level: 'low', label: '🟡 Low Stock', color: '#f59e0b' }
  if (percentage < 50) return { level: 'medium', label: '🟢 Medium', color: '#10b981' }
  return { level: 'good', label: '🟢 Good', color: '#10b981' }
}

const SPIRIT_TYPES = [
  'Vodka',
  'Cognac',
  'Whiskey',
  'Rum',
  'Scotch',
  'Gin',
  'Tequila',
  'Brandy',
  'Bourbon',
  'Rye',
  'Mezcal',
  'Liqueur',
  'Aperitif',
  'Digestif',
  'Wine',
  'Vermouth',
  'Beer',
  'Mixer',
  'Syrup',
  'Bitters',
  'Garnish',
  'Tool',
  'Other'
]

const createEmptyInventoryItem = () => ({
  type: SPIRIT_TYPES[0],
  name: '',
  proof: '',
  bottleSizeMl: '',
  amountRemaining: '',
  flavorNotes: ''
})

const normalizeInventoryItem = (item) => {
  if (!item || typeof item !== 'object') {
    return createEmptyInventoryItem()
  }

  const rawType = item.type ? String(item.type) : ''
  const normalizedType = rawType ? rawType : 'Other'
  const hasExplicitAmount = item.amountRemaining === 0 || Boolean(item.amountRemaining)
  const amountFromLegacy = !hasExplicitAmount && item.quantity ? String(item.quantity) : ''

  return {
    type: SPIRIT_TYPES.includes(normalizedType) ? normalizedType : (normalizedType || 'Other'),
    name: item.name ? String(item.name) : '',
    proof: item.proof === 0 || item.proof ? String(item.proof) : '',
    bottleSizeMl: item.bottleSizeMl === 0 || item.bottleSizeMl ? String(item.bottleSizeMl) : '',
    amountRemaining: hasExplicitAmount ? String(item.amountRemaining) : amountFromLegacy,
    flavorNotes: item.flavorNotes
      ? String(item.flavorNotes)
      : (amountFromLegacy && item.unit ? `Legacy amount tracked as ${amountFromLegacy} ${item.unit}` : '')
  }
}

const ensureInventoryShape = (items = []) => items.map(normalizeInventoryItem)

const normalizeSearchText = (value) => {
  if (!value) return ''
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildItemSearchText = (item) => {
  const parts = [
    item.name,
    item.type,
    item.flavorNotes,
    item.proof,
    item.bottleSizeMl,
    item.amountRemaining
  ]
  return normalizeSearchText(parts.filter(Boolean).join(' '))
}

// Recipe Builder Component
function RecipeBuilder({ recipe, inventory, onSave, onCancel }) {
  const [name, setName] = useState(recipe?.name || '')
  const [ingredients, setIngredients] = useState(recipe?.ingredients || [])
  const [instructions, setInstructions] = useState(recipe?.instructions || '')
  const [glass, setGlass] = useState(recipe?.glass || '')
  const [garnish, setGarnish] = useState(recipe?.garnish || '')
  const [tags, setTags] = useState(recipe?.tags || '')

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '', unit: 'ml' }])
  }

  const updateIngredient = (idx, field, value) => {
    const updated = [...ingredients]
    updated[idx][field] = value
    setIngredients(updated)
  }

  const removeIngredient = (idx) => {
    setIngredients(ingredients.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a recipe name')
      return
    }
    if (ingredients.length === 0) {
      alert('Please add at least one ingredient')
      return
    }
    const validIngredients = ingredients.filter(ing => ing.name && ing.amount)
    if (validIngredients.length === 0) {
      alert('Please complete at least one ingredient')
      return
    }

    const recipeData = {
      id: recipe?.id || Date.now(),
      name: name.trim(),
      ingredients: validIngredients,
      instructions: instructions.trim(),
      glass: glass.trim(),
      garnish: garnish.trim(),
      tags: tags.trim(),
      created: recipe?.created || Date.now()
    }
    onSave(recipeData)
  }

  return (
    <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb' }}>
      <h3 style={{ marginTop: 0 }}>{recipe ? 'Edit Recipe' : 'Create New Recipe'}</h3>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Recipe Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Classic Margarita"
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Ingredients</label>
        {ingredients.map((ing, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <select
              value={ing.name}
              onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
              style={{ flex: 2, padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
            >
              <option value="">Select ingredient...</option>
              {inventory.map((item, i) => (
                <option key={i} value={item.name}>{item.name} ({item.type})</option>
              ))}
            </select>
            <input
              type="number"
              value={ing.amount}
              onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
              placeholder="Amount"
              style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
            />
            <select
              value={ing.unit}
              onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
            >
              <option value="ml">ml</option>
              <option value="oz">oz</option>
              <option value="dash">dash</option>
              <option value="tsp">tsp</option>
            </select>
            <button
              onClick={() => removeIngredient(idx)}
              style={{ padding: '8px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addIngredient}
          style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          + Add Ingredient
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Instructions</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Step-by-step instructions..."
          rows={4}
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Glassware</label>
          <input
            type="text"
            value={glass}
            onChange={(e) => setGlass(e.target.value)}
            placeholder="e.g., Martini"
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Garnish</label>
          <input
            type="text"
            value={garnish}
            onChange={(e) => setGarnish(e.target.value)}
            placeholder="e.g., Lime wheel"
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g., vodka, martini, craft"
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleSave}
          style={{ flex: 1, padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
        >
          {recipe ? 'Update Recipe' : 'Save Recipe'}
        </button>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '10px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// Recipe Card Component with Flexible Ingredient Matching
function RecipeCard({ recipe, inventory, onEdit, onDelete, onMake, onAddToShoppingList }) {
  const [expanded, setExpanded] = useState(false)

  // Check if we have all ingredients with flexible matching
  const checkIngredients = () => {
    return recipe.ingredients.map(ing => {
      const ingNameLower = ing.name.toLowerCase().trim()

      const invItem = inventory.find(item => {
        const itemNameLower = item.name.toLowerCase().trim()
        const itemTypeLower = (item.type || '').toLowerCase().trim()

        // Exact match (case-insensitive)
        if (itemNameLower === ingNameLower) {
          return true
        }

        // Base spirit types that we should match by TYPE field
        const baseSpirits = ['vodka', 'rum', 'gin', 'whiskey', 'whisky', 'tequila', 'bourbon', 'brandy', 'cognac', 'scotch', 'rye', 'mezcal']

        // Check if recipe wants a plain base spirit (e.g., just "Vodka")
        if (baseSpirits.includes(ingNameLower)) {
          // Match by TYPE field
          if (itemTypeLower === ingNameLower) {
            // Make sure inventory name doesn't have flavor descriptors
            const flavorWords = ['apple', 'green', 'cherry', 'vanilla', 'citrus', 'spiced', 'coconut', 'pineapple', 'mango', 'peach', 'raspberry', 'strawberry', 'blueberry', 'blackberry']
            const nameHasFlavor = flavorWords.some(flavor => itemNameLower.includes(flavor))

            if (!nameHasFlavor) {
              return true
            }
          }
          return false // Continue to next item
        }

        // Check for flavored spirits (e.g., "Apple Vodka", "Spiced Rum")
        // Split recipe ingredient into words
        const ingWords = ingNameLower.split(/\s+/)

        // Check if recipe contains a base spirit
        const hasBaseSpirit = ingWords.some(word => baseSpirits.includes(word))

        if (hasBaseSpirit) {
          // Recipe wants a flavored spirit
          // Check if type matches first
          const spiritType = ingWords.find(word => baseSpirits.includes(word))
          if (itemTypeLower !== spiritType) return false

          // Then check if all flavor words are in the name or flavor notes
          const combinedText = `${itemNameLower} ${(item.flavorNotes || '').toLowerCase()}`
          const flavorWords = ingWords.filter(word => !baseSpirits.includes(word))

          return flavorWords.every(word => combinedText.includes(word))
        }

        // For non-spirits (mixers, sugar, juice, etc.): simple word matching
        // "Lime Juice" matches anything with "lime" AND "juice"
        // "Sugar" matches anything with "sugar"
        const recipeWords = ingNameLower.split(/\s+/).filter(w => w.length > 2)

        return recipeWords.every(word =>
          itemNameLower.includes(word) || (item.flavorNotes || '').toLowerCase().includes(word)
        )
      })

      if (!invItem) return { ...ing, available: false, remaining: 0 }

      // For pantry items (garnish, tools, etc.), existence = availability
      const pantryTypes = ['other', 'garnish', 'tool', 'bitters', 'syrup']
      const isPantryItem = pantryTypes.includes((invItem.type || '').toLowerCase())

      if (isPantryItem) {
        // Pantry items don't need quantity tracking - if it exists, it's available
        return { ...ing, available: true, remaining: 999999, matchedItem: invItem.name }
      }

      // For spirits/liquids, check quantity
      const neededMl = ing.unit === 'oz' ? parseFloat(ing.amount) * 30 : parseFloat(ing.amount)
      const remaining = parseFloat(invItem.amountRemaining)

      // If amount is not a number (empty, "In Stock", etc.), treat as available
      if (isNaN(remaining)) {
        return { ...ing, available: true, remaining: 999999, matchedItem: invItem.name }
      }

      return { ...ing, available: remaining >= neededMl, remaining, matchedItem: invItem.name }
    })
  }

  const ingredientStatus = checkIngredients()
  const canMake = ingredientStatus.every(ing => ing.available)
  const missingIngredients = ingredientStatus.filter(ing => !ing.available)

  const makeRecipe = () => {
    const updates = ingredientStatus
      .filter(ing => ing.matchedItem)
      .map(ing => {
        const mlAmount = ing.unit === 'oz' ? parseFloat(ing.amount) * 30 : parseFloat(ing.amount)
        return { name: ing.matchedItem, subtract: mlAmount }
      })
    onMake(updates)
    alert(`Made ${recipe.name}! Inventory updated.`)
  }

  const addMissingToShoppingList = () => {
    missingIngredients.forEach(ing => {
      onAddToShoppingList({
        name: ing.name,
        type: 'Recipe Ingredient',
        amount: `${ing.amount} ${ing.unit}`
      })
    })
    alert(`Added ${missingIngredients.length} missing ingredient(s) to shopping list!`)
  }

  return (
    <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>{recipe.name}</h3>
          {recipe.tags && (
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{recipe.tags}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onEdit(recipe)} style={{ padding: '4px 8px', fontSize: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
          <button onClick={() => { if (confirm(`Delete ${recipe.name}?`)) onDelete(recipe.id) }} style={{ padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ fontSize: '14px' }}>Ingredients:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '14px' }}>
          {ingredientStatus.map((ing, idx) => (
            <li key={idx} style={{ color: ing.available ? '#059669' : '#dc2626' }}>
              {ing.name}: {ing.amount} {ing.unit} {ing.available ? '✓' : '✗ Missing'}
            </li>
          ))}
        </ul>
      </div>

      {expanded && (
        <>
          {recipe.instructions && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ fontSize: '14px' }}>Instructions:</strong>
              <p style={{ margin: '8px 0', fontSize: '14px', whiteSpace: 'pre-line' }}>{recipe.instructions}</p>
            </div>
          )}
          {recipe.glass && (
            <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Glass:</strong> {recipe.glass}</p>
          )}
          {recipe.garnish && (
            <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Garnish:</strong> {recipe.garnish}</p>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ flex: 1, minWidth: '120px', padding: '8px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
        <button
          onClick={makeRecipe}
          disabled={!canMake}
          style={{
            flex: 1,
            minWidth: '120px',
            padding: '8px',
            background: canMake ? '#10b981' : '#d1d5db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: canMake ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          Make This Drink
        </button>
        {missingIngredients.length > 0 && (
          <button
            onClick={addMissingToShoppingList}
            style={{
              flex: 1,
              minWidth: '120px',
              padding: '8px',
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            🛒 Add Missing ({missingIngredients.length})
          </button>
        )}
      </div>
    </div>
  )
}

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [inventory, setInventory] = useState([])
  const [showInventory, setShowInventory] = useState(false)
  const [editingInventory, setEditingInventory] = useState(false)
  const [showTomInfo, setShowTomInfo] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedTypes, setCollapsedTypes] = useState({})
  const [savingInventory, setSavingInventory] = useState(false)
  const [generatingNotes, setGeneratingNotes] = useState(false)
  const [noteStatus, setNoteStatus] = useState('')

  // New state for advanced features
  const [currentView, setCurrentView] = useState('chat') // 'chat', 'inventory', 'recipes'
  const [customRecipes, setCustomRecipes] = useState([])
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [creatingRecipe, setCreatingRecipe] = useState(false)
  const [sortBy, setSortBy] = useState('type')
  const [filterType, setFilterType] = useState('all')
  const [filterStockLevel, setFilterStockLevel] = useState('all')
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [itemUnits, setItemUnits] = useState({})
  const [favoriteRecipes, setFavoriteRecipes] = useState([])

  // New UI/UX enhancement state
  const [shoppingList, setShoppingList] = useState([])
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const messagesEndRef = useRef(null)
  const fieldLabelStyle = {
    display: 'block',
    fontSize: '12px',
    color: '#4b5563',
    fontWeight: 600,
    marginBottom: '4px'
  }
  const fieldInputStyle = {
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px'
  }

  const WORKER_URL = 'https://bartender-api.eugene-tawiah.workers.dev/api' // Cloudflare Worker endpoint

  // Load all data on mount
  useEffect(() => {
    loadInventory()
    loadRecipes()
    loadShopping()
    loadFavorites()
    loadChatHistory()
  }, [])

  const loadRecipes = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/recipes`)
      const data = await response.json()
      let recipesData = data.recipes || []

      // If empty, load initial recipes
      if (recipesData.length === 0) {
        try {
          const initialResponse = await fetch('/initial-recipes.json')
          const initialData = await initialResponse.json()
          recipesData = initialData || []
          // Save initial recipes to backend
          await fetch(`${WORKER_URL}/recipes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipes: recipesData })
          })
        } catch (err) {
          console.error('Failed to load initial recipes:', err)
        }
      }

      setCustomRecipes(recipesData)
    } catch (error) {
      console.error('Failed to load recipes:', error)
    }
  }

  const loadShopping = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/shopping`)
      const data = await response.json()
      setShoppingList(data.shopping || [])
    } catch (error) {
      console.error('Failed to load shopping list:', error)
    }
  }

  const loadFavorites = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/favorites`)
      const data = await response.json()
      setFavoriteRecipes(data.favorites || [])
    } catch (error) {
      console.error('Failed to load favorites:', error)
    }
  }

  const loadChatHistory = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/chat-history`)
      const data = await response.json()
      setMessages(data.chatHistory || [])
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }

  // Save functions
  const saveRecipes = async (recipes) => {
    try {
      await fetch(`${WORKER_URL}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipes })
      })
    } catch (error) {
      console.error('Failed to save recipes:', error)
    }
  }

  const saveShopping = async (shopping) => {
    try {
      await fetch(`${WORKER_URL}/shopping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopping })
      })
    } catch (error) {
      console.error('Failed to save shopping list:', error)
    }
  }

  const saveFavorites = async (favorites) => {
    try {
      await fetch(`${WORKER_URL}/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites })
      })
    } catch (error) {
      console.error('Failed to save favorites:', error)
    }
  }

  const saveChatHistory = async (chatHistory) => {
    try {
      await fetch(`${WORKER_URL}/chat-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatHistory })
      })
    } catch (error) {
      console.error('Failed to save chat history:', error)
    }
  }

  // Save recipes to backend
  useEffect(() => {
    if (customRecipes.length > 0) {
      saveRecipes(customRecipes)
    }
  }, [customRecipes])

  // Save shopping list to backend
  useEffect(() => {
    saveShopping(shoppingList)
  }, [shoppingList])

  // Auto-remove shopping list items when they appear in inventory
  useEffect(() => {
    if (shoppingList.length === 0 || inventory.length === 0) return

    const itemsToRemove = shoppingList.filter(shopItem => {
      // Check if this shopping list item now exists in inventory
      return inventory.some(invItem => {
        const shopNameLower = shopItem.name.toLowerCase().trim()
        const invNameLower = invItem.name.toLowerCase().trim()
        const invTypeLower = (invItem.type || '').toLowerCase().trim()

        // Match by exact name or by type (for generic ingredients like "Vodka")
        return invNameLower.includes(shopNameLower) ||
               shopNameLower.includes(invNameLower) ||
               invTypeLower === shopNameLower
      })
    })

    if (itemsToRemove.length > 0) {
      const updatedList = shoppingList.filter(shopItem =>
        !itemsToRemove.some(removed => removed.name === shopItem.name)
      )
      setShoppingList(updatedList)
      console.log(`Auto-removed ${itemsToRemove.length} item(s) from shopping list (now in inventory)`)
    }
  }, [inventory, shoppingList])

  // Save chat messages to backend
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages)
    }
  }, [messages])

  // Mobile responsive resize handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadInventory = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/inventory`)
      const data = await response.json()
      let inventoryData = data.inventory || []

      // If inventory is empty, load initial inventory from CSV
      if (inventoryData.length === 0) {
        try {
          const initialResponse = await fetch('/initial-inventory.json')
          const initialData = await initialResponse.json()
          inventoryData = initialData
          // Save the initial inventory to the backend
          await fetch(`${WORKER_URL}/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inventory: initialData })
          })
        } catch (err) {
          console.error('Failed to load initial inventory:', err)
        }
      }

      const normalizedInventory = ensureInventoryShape(inventoryData)
      setInventory(normalizedInventory)
    } catch (error) {
      console.error('Failed to load inventory:', error)
    }
  }

  const saveInventory = async (newInventory) => {
    if (savingInventory) return

    setSavingInventory(true)
    setNoteStatus('')

    let normalizedInventory = ensureInventoryShape(newInventory)
    let finalStatusMessage = ''

    try {
      const itemsMissingNotes = normalizedInventory.filter(item => {
        const hasName = item.name && item.name.trim().length > 0
        const hasNotes = item.flavorNotes && item.flavorNotes.trim().length > 0
        return hasName && !hasNotes
      })

      let enrichedInventory = normalizedInventory

      if (itemsMissingNotes.length > 0) {
        setGeneratingNotes(true)
        finalStatusMessage = 'Crafting flavor notes with Gemini...'
        setNoteStatus(finalStatusMessage)

        const enrichResponse = await fetch(`${WORKER_URL}/enrich-inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory: normalizedInventory })
        })

        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json()
          const candidateInventory = enrichData.inventory || normalizedInventory
          enrichedInventory = ensureInventoryShape(candidateInventory)
          setInventory(enrichedInventory)
          finalStatusMessage = 'Flavor notes added automatically. Feel free to tweak them before saving.'
          setNoteStatus(finalStatusMessage)
        } else {
          finalStatusMessage = 'Could not generate flavor notes automatically. You can add them manually.'
          setNoteStatus(finalStatusMessage)
        }
      }

      // Save the enriched or original inventory
      const response = await fetch(`${WORKER_URL}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: enrichedInventory })
      })

      if (!response.ok) {
        throw new Error('Failed to save inventory')
      }

      setInventory(enrichedInventory)
      setEditingInventory(false)
      if (!finalStatusMessage) {
        finalStatusMessage = 'Inventory saved.'
        setNoteStatus(finalStatusMessage)
      }
    } catch (error) {
      console.error('Failed to save inventory:', error)
      alert('Failed to save inventory')
    } finally {
      setGeneratingNotes(false)
      setSavingInventory(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch(`${WORKER_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          inventory: inventory,
          chatHistory: messages
        })
      })

      const data = await response.json()

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error}`
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response
        }])

        // If inventory was updated, refresh it
        if (data.updatedInventory) {
          setInventory(data.updatedInventory)
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const addInventoryItem = () => {
    const newItem = createEmptyInventoryItem()
    // Add new item at the beginning so it appears at the top
    setInventory([newItem, ...inventory])
    // Clear search query so new item is visible
    setSearchQuery('')
  }

  const updateInventoryItem = (index, field, value) => {
    const newInventory = [...inventory]
    newInventory[index][field] = value
    setInventory(newInventory)
  }

  const removeInventoryItem = (index) => {
    const newInventory = inventory.filter((_, i) => i !== index)
    setInventory(newInventory)
  }

  const toggleTypeCollapse = (type) => {
    setCollapsedTypes(prev => {
      const currentState = prev[type] !== false // true if collapsed or undefined
      return { ...prev, [type]: currentState ? false : true }
    })
  }

  // Export/Import Functions
  const exportToCSV = () => {
    const headers = ['Type', 'Name', 'Proof', 'Bottle Size (ml)', 'Amount Remaining (ml)', 'Flavor Notes']
    const rows = inventory.map(item => [
      item.type || '', item.name || '', item.proof || '',
      item.bottleSizeMl || '', item.amountRemaining || '', item.flavorNotes || ''
    ])
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bar-inventory-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportToJSON = () => {
    const blob = new Blob([JSON.stringify(inventory, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bar-inventory-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFromJSON = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result)
          if (Array.isArray(imported)) {
            const normalized = ensureInventoryShape(imported)
            setInventory(normalized)
            alert(`Imported ${normalized.length} items. Remember to save!`)
          } else {
            alert('Invalid file format. Expected JSON array.')
          }
        } catch (error) {
          alert('Failed to parse JSON file.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // Bulk Operations
  const bulkDelete = () => {
    if (selectedItems.size === 0) return
    if (!confirm(`Delete ${selectedItems.size} selected items?`)) return
    const newInventory = inventory.filter((_, idx) => !selectedItems.has(idx))
    setInventory(newInventory)
    setSelectedItems(new Set())
    setBulkSelectMode(false)
  }

  const bulkAdjust = (mlChange) => {
    if (selectedItems.size === 0) return
    const newInventory = [...inventory]
    selectedItems.forEach(idx => {
      const current = parseFloat(newInventory[idx].amountRemaining) || 0
      newInventory[idx].amountRemaining = String(Math.max(0, current + mlChange))
    })
    setInventory(newInventory)
  }

  const selectAll = () => {
    const { newItems, grouped } = getGroupedInventory()
    const allIndexes = new Set()
    newItems.forEach(item => allIndexes.add(item.originalIndex))
    Object.values(grouped).forEach(items => {
      items.forEach(item => allIndexes.add(item.originalIndex))
    })
    setSelectedItems(allIndexes)
  }

  // Recipe Functions
  const saveRecipe = (recipeData) => {
    if (editingRecipe) {
      setCustomRecipes(customRecipes.map(r => r.id === recipeData.id ? recipeData : r))
    } else {
      setCustomRecipes([...customRecipes, recipeData])
    }
    setCreatingRecipe(false)
    setEditingRecipe(null)
  }

  const deleteRecipe = (recipeId) => {
    setCustomRecipes(customRecipes.filter(r => r.id !== recipeId))
  }

  const makeRecipe = (updates) => {
    const newInventory = [...inventory]
    updates.forEach(({ name, subtract }) => {
      const idx = newInventory.findIndex(item => item.name === name)
      if (idx !== -1) {
        const current = parseFloat(newInventory[idx].amountRemaining) || 0
        newInventory[idx].amountRemaining = String(Math.max(0, current - subtract))
      }
    })
    setInventory(newInventory)
    saveInventory(newInventory)
  }

  // Quick Adjust Function for inventory
  const quickAdjust = (index, ozAmount) => {
    const mlAmount = ozAmount * 29.5735
    const newInventory = [...inventory]
    const current = parseFloat(newInventory[index].amountRemaining) || 0
    newInventory[index].amountRemaining = String(Math.max(0, current - mlAmount))
    setInventory(newInventory)
  }

  // Shopping List Functions
  const addToShoppingList = (item) => {
    if (shoppingList.some(i => i.name.toLowerCase() === item.name.toLowerCase())) {
      // Already exists - skip silently
      return
    }
    setShoppingList([...shoppingList, {
      name: item.name,
      type: item.type || 'Recipe Ingredient',
      size: item.bottleSizeMl || item.size,
      amount: item.amount, // For recipe ingredients
      added: Date.now()
    }])
  }

  // Touch Gesture Handlers for Mobile Navigation
  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    const views = ['chat', 'inventory', 'recipes']
    const currentIndex = views.indexOf(currentView)

    if (isLeftSwipe && currentIndex < views.length - 1) {
      setCurrentView(views[currentIndex + 1])
    }

    if (isRightSwipe && currentIndex > 0) {
      setCurrentView(views[currentIndex - 1])
    }
  }

  // Group inventory by type and apply search filter
  // Separate new/unsaved items (no name) from grouped items
  const getGroupedInventory = () => {
    const normalizedQuery = normalizeSearchText(searchQuery)
    const queryTokens = normalizedQuery ? normalizedQuery.split(' ') : []

    const filtered = inventory.filter(item => {
      if (queryTokens.length === 0) return true
      const searchableText = buildItemSearchText(item)
      if (!searchableText) return false
      return queryTokens.every(token => searchableText.includes(token))
    })

    const newItems = []
    const grouped = {}

    filtered.forEach((item, index) => {
      const originalIndex = inventory.indexOf(item)

      // New items (no name) should appear ungrouped at the top
      if (!item.name || item.name.trim() === '') {
        newItems.push({ ...item, originalIndex })
      } else {
        const type = item.type || 'Other'
        if (!grouped[type]) grouped[type] = []
        grouped[type].push({ ...item, originalIndex })
      }
    })

    return { newItems, grouped }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      maxWidth: '800px',
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header with Purple Moonz Branding and Three Tabs */}
      <div style={{
        padding: '16px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        {/* Purple Moonz Branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <a
              href="https://barmenu.tawiah.net"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                textDecoration: 'none',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '24px' }}>🌙</span>
              <span style={{ fontSize: '24px', fontWeight: 700 }}>Purple Moonz</span>
            </a>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
              AI-powered home bartending
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTomInfo(prev => !prev)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            powered by Tom Bullock
          </button>
        </div>

        {showTomInfo && (
          <div
            id="tom-bullock-info"
            style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '13px',
              lineHeight: 1.5,
              color: 'white'
            }}
          >
            <strong>Who is Tom Bullock?</strong> Tom Bullock (1872–1964) was an influential American bartender and the first African American to publish a cocktail book, titled "The Ideal Bartender." Born in Louisville, Kentucky, to a former slave and a Union Army veteran, he worked at prestigious clubs like the Pendennis Club and the St. Louis Country Club. His 1917 book is one of the last cocktail manuals released before Prohibition, preserving a unique snapshot of pre-Prohibition recipes and American drinking culture.
          </div>
        )}

        {/* Three-Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setCurrentView('chat')}
            style={{
              flex: 1,
              padding: '10px',
              background: currentView === 'chat' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: currentView === 'chat' ? '600' : '400'
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setCurrentView('inventory')}
            style={{
              flex: 1,
              padding: '10px',
              background: currentView === 'inventory' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: currentView === 'inventory' ? '600' : '400'
            }}
          >
            Inventory ({inventory.length})
          </button>
          <button
            onClick={() => setCurrentView('recipes')}
            style={{
              flex: 1,
              padding: '10px',
              background: currentView === 'recipes' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: currentView === 'recipes' ? '600' : '400'
            }}
          >
            Favorites ({customRecipes.length})
          </button>
        </div>
      </div>

      {/* Main Content - Three-Way View Switching */}
      {currentView === 'chat' && (
        <>
          {/* Chat Messages */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              background: '#f5f5f5'
            }}
          >
            {messages.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all chat history?')) {
                    setMessages([])
                    localStorage.removeItem('bartenderChatHistory')
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '12px' : '14px',
                  marginBottom: '16px'
                }}
              >
                🗑️ Clear Chat History
              </button>
            )}

            {messages.length === 0 && (
              <div style={{
                textAlign: 'center',
                color: '#666',
                marginTop: '40px'
              }}>
                <p style={{ fontSize: '18px', marginBottom: '16px' }}>👋 Welcome!</p>
                <p style={{ fontSize: '14px', lineHeight: '1.6' }}>
                  Ask me to make you a drink, suggest cocktails based on your ingredients,<br/>
                  or help you manage your bar inventory.
                </p>
                <p style={{ fontSize: '12px', marginTop: '16px', color: '#999' }}>
                  Try: "Make me a margarita" or "What can I make with vodka?"
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '12px'
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: '16px',
                    background: msg.role === 'user' ? '#667eea' : 'white',
                    color: msg.role === 'user' ? 'white' : '#333',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <span style={{ color: '#667eea' }}>Mixing up a response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '16px',
            background: 'white',
            borderTop: '1px solid #e0e0e0'
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask for a drink or inventory help..."
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '24px',
                  border: '2px solid #e0e0e0',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  background: loading || !input.trim() ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '12px 24px',
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}

      {currentView === 'inventory' && (
        // Inventory View with Export/Import and Bulk Operations
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#f5f5f5'
          }}
        >
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Bar Inventory</h2>
              {!editingInventory ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={exportToCSV}
                    style={{
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={exportToJSON}
                    style={{
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={importFromJSON}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Import JSON
                  </button>
                  <button
                    onClick={() => {
                      setEditingInventory(true)
                      setNoteStatus('')
                    }}
                  style={{
                    background: '#667eea',
                    color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                      onClick={() => setBulkSelectMode(!bulkSelectMode)}
                      style={{
                        background: bulkSelectMode ? '#ef4444' : '#6b7280',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      {bulkSelectMode ? 'Cancel Bulk' : 'Bulk Select'}
                    </button>
                    {bulkSelectMode && (
                      <>
                        <button
                          onClick={selectAll}
                          style={{
                            background: '#6b7280',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          Select All
                        </button>
                        <button
                          onClick={bulkDelete}
                          disabled={selectedItems.size === 0}
                          style={{
                            background: selectedItems.size === 0 ? '#d1d5db' : '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: selectedItems.size === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          Delete ({selectedItems.size})
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => saveInventory(inventory)}
                      disabled={savingInventory}
                      style={{
                        background: savingInventory ? '#6ee7b7' : '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: savingInventory ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        transition: 'background 0.2s ease'
                      }}
                    >
                      {savingInventory ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        loadInventory()
                        setEditingInventory(false)
                        setNoteStatus('')
                        setBulkSelectMode(false)
                        setSelectedItems(new Set())
                      }}
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {noteStatus && (
                    <p style={{
                      marginTop: '12px',
                      fontSize: '13px',
                      color: generatingNotes ? '#2563eb' : '#047857'
                    }}>
                      {noteStatus}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, type, or flavor notes..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '2px solid #e0e0e0',
                  fontSize: isMobile ? '12px' : '14px',
                  outline: 'none'
                }}
              />
            </div>

            {/* Shopping List Section */}
            {shoppingList.length > 0 && (
              <div style={{
                background: '#fef3c7',
                border: '2px solid #fbbf24',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: isMobile ? '14px' : '16px' }}>
                  🛒 Shopping List ({shoppingList.length})
                </h3>
                {shoppingList.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px',
                    background: 'white',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '8px' : '0'
                  }}>
                    <span style={{ fontSize: isMobile ? '12px' : '14px' }}>
                      <strong>{item.name}</strong> ({item.type})
                      {item.amount && ` - ${item.amount}`}
                      {item.size && ` - ${item.size}ml`}
                    </span>
                    <button
                      onClick={() => setShoppingList(shoppingList.filter((_, i) => i !== idx))}
                      style={{
                        padding: '4px 8px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: isMobile ? '11px' : '12px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    if (confirm('Clear entire shopping list?')) {
                      setShoppingList([])
                      localStorage.removeItem('shoppingList')
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: isMobile ? '12px' : '14px',
                    marginTop: '8px'
                  }}
                >
                  Clear All
                </button>
              </div>
            )}

            {inventory.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '40px 0' }}>
                <p>Your bar is empty!</p>
                <button
                  onClick={addInventoryItem}
                  style={{
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginTop: '12px',
                    fontSize: '14px'
                  }}
                >
                  Add Your First Item
                </button>
              </div>
            ) : (
              <div>
                {(() => {
                  const { newItems, grouped } = getGroupedInventory()

                  return (
                    <>
                      {/* New/Unsaved Items - Show at top when editing */}
                      {editingInventory && newItems.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{
                            padding: '12px 16px',
                            background: '#f59e0b',
                            color: 'white',
                            borderRadius: '8px',
                            marginBottom: '8px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '16px', fontWeight: '600' }}>✏️ New Items</span>
                              <span style={{
                                fontSize: '14px',
                                background: 'rgba(255,255,255,0.2)',
                                padding: '2px 8px',
                                borderRadius: '12px'
                              }}>
                                {newItems.length}
                              </span>
                            </div>
                          </div>
                          {newItems.map((item) => {
                        const idx = item.originalIndex
                        const typeOptions = item.type && !SPIRIT_TYPES.includes(item.type)
                          ? [item.type, ...SPIRIT_TYPES]
                          : SPIRIT_TYPES

                        return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '12px',
                        background: '#f9fafb',
                        borderRadius: '8px',
                        marginBottom: '8px'
                      }}
                    >
                      {editingInventory ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {bulkSelectMode && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="checkbox"
                                checked={selectedItems.has(idx)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedItems)
                                  if (e.target.checked) {
                                    newSelected.add(idx)
                                  } else {
                                    newSelected.delete(idx)
                                  }
                                  setSelectedItems(newSelected)
                                }}
                                style={{ width: '20px', height: '20px' }}
                              />
                              <span style={{ fontSize: '14px', fontWeight: '600' }}>Select this item</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                              <label style={fieldLabelStyle}>Type</label>
                              <select
                                value={item.type}
                                onChange={(e) => updateInventoryItem(idx, 'type', e.target.value)}
                                style={fieldInputStyle}
                              >
                                {typeOptions.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ flex: '2 1 240px', minWidth: '200px' }}>
                              <label style={fieldLabelStyle}>Name</label>
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateInventoryItem(idx, 'name', e.target.value)}
                                placeholder="Bottle name"
                                style={fieldInputStyle}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                              <label style={fieldLabelStyle}>Proof</label>
                              <input
                                type="number"
                                min="0"
                                value={item.proof}
                                onChange={(e) => updateInventoryItem(idx, 'proof', e.target.value)}
                                placeholder="e.g. 80"
                                style={fieldInputStyle}
                              />
                            </div>
                            <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                              <label style={fieldLabelStyle}>Bottle Size (ml)</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={convertFromMl(
                                    item.bottleSizeMl,
                                    itemUnits[`${idx}-bottle`] || 'ml'
                                  )}
                                  onChange={(e) => {
                                    const unit = itemUnits[`${idx}-bottle`] || 'ml'
                                    const mlValue = convertToMl(e.target.value, unit)
                                    updateInventoryItem(idx, 'bottleSizeMl', mlValue)
                                  }}
                                  placeholder="e.g. 750"
                                  style={{ ...fieldInputStyle, flex: 1 }}
                                />
                                <select
                                  value={itemUnits[`${idx}-bottle`] || 'ml'}
                                  onChange={(e) => {
                                    const newUnit = e.target.value
                                    setItemUnits({ ...itemUnits, [`${idx}-bottle`]: newUnit })
                                  }}
                                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px' }}
                                >
                                  <option value="ml">ml</option>
                                  <option value="L">L</option>
                                  <option value="oz">oz</option>
                                </select>
                              </div>
                            </div>
                            <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                              <label style={fieldLabelStyle}>Amount Remaining</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={convertFromMl(
                                    item.amountRemaining,
                                    itemUnits[`${idx}-remaining`] || 'ml'
                                  )}
                                  onChange={(e) => {
                                    const unit = itemUnits[`${idx}-remaining`] || 'ml'
                                    const mlValue = convertToMl(e.target.value, unit)
                                    updateInventoryItem(idx, 'amountRemaining', mlValue)
                                  }}
                                  placeholder="e.g. 300"
                                  style={{ ...fieldInputStyle, flex: 1 }}
                                />
                                <select
                                  value={itemUnits[`${idx}-remaining`] || 'ml'}
                                  onChange={(e) => {
                                    const newUnit = e.target.value
                                    setItemUnits({ ...itemUnits, [`${idx}-remaining`]: newUnit })
                                  }}
                                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px' }}
                                >
                                  <option value="ml">ml</option>
                                  <option value="L">L</option>
                                  <option value="oz">oz</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label style={fieldLabelStyle}>Flavor Notes</label>
                            <textarea
                              value={item.flavorNotes}
                              onChange={(e) => updateInventoryItem(idx, 'flavorNotes', e.target.value)}
                              placeholder="Tasting notes, cocktail uses, etc."
                              rows={3}
                              style={{ ...fieldInputStyle, resize: 'vertical' }}
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => removeInventoryItem(idx)}
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontWeight: 600, fontSize: isMobile ? '14px' : '15px', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                            {item.name || 'Unnamed Bottle'}
                            {shouldShowProgress(item.type) && (() => {
                              const stockStatus = getStockLevel(
                                parseFloat(item.amountRemaining) || 0,
                                parseFloat(item.bottleSizeMl) || 0
                              )
                              return (stockStatus.level === 'critical' || stockStatus.level === 'low') ? (
                                <span style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: stockStatus.color,
                                  color: 'white',
                                  marginLeft: '8px'
                                }}>
                                  {stockStatus.label}
                                </span>
                              ) : null
                            })()}
                          </div>
                          <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                            {item.type || 'Type not set'}
                          </div>
                          <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                            {item.proof ? `Proof: ${item.proof}` : 'Proof not set'}
                          </div>
                          <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                            {item.bottleSizeMl ? `Bottle size: ${item.bottleSizeMl} ml` : 'Bottle size not set'}
                          </div>
                          <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                            {item.amountRemaining
                              ? `Remaining: ${item.amountRemaining} ml`
                              : 'Amount remaining not set'}
                          </div>
                          {shouldShowProgress(item.type) && item.bottleSizeMl && item.amountRemaining && (
                            <ProgressBar
                              current={parseFloat(item.amountRemaining) || 0}
                              total={parseFloat(item.bottleSizeMl) || 0}
                            />
                          )}
                          {item.flavorNotes && (
                            <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#374151' }}>
                              Notes: {item.flavorNotes}
                            </div>
                          )}
                          {!editingInventory && (
                            <>
                              <div style={{
                                display: 'flex',
                                gap: '4px',
                                marginTop: '8px',
                                flexWrap: 'wrap'
                              }}>
                                <button onClick={() => quickAdjust(idx, 1)} style={{ fontSize: isMobile ? '10px' : '11px', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  -1 oz
                                </button>
                                <button onClick={() => quickAdjust(idx, 1.5)} style={{ fontSize: isMobile ? '10px' : '11px', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  -Shot (1.5oz)
                                </button>
                                <button onClick={() => quickAdjust(idx, 2)} style={{ fontSize: isMobile ? '10px' : '11px', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  -2 oz
                                </button>
                              </div>
                              {shouldShowProgress(item.type) && (() => {
                                const stockStatus = getStockLevel(
                                  parseFloat(item.amountRemaining) || 0,
                                  parseFloat(item.bottleSizeMl) || 0
                                )
                                return (stockStatus.level === 'critical' || stockStatus.level === 'low') && (
                                  <button
                                    onClick={() => addToShoppingList(item)}
                                    style={{
                                      fontSize: isMobile ? '10px' : '11px',
                                      padding: '4px 8px',
                                      background: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      marginTop: '4px',
                                      width: isMobile ? '100%' : 'auto'
                                    }}
                                  >
                                    📝 Add to Shopping List
                                  </button>
                                )
                              })()}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                        </div>
                      )}

                      {/* Grouped by Type */}
                      {Object.entries(grouped).map(([type, items]) => {
                        // Default to collapsed (true) if not explicitly set
                        const isCollapsed = collapsedTypes[type] !== false

                        return (
                          <div key={type} style={{ marginBottom: '16px' }}>
                            {/* Type Header */}
                            <div
                              onClick={() => toggleTypeCollapse(type)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 16px',
                                background: '#667eea',
                                color: 'white',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                userSelect: 'none',
                                marginBottom: '8px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '18px', fontWeight: '600' }}>
                                  {isCollapsed ? '▶' : '▼'}
                                </span>
                                <span style={{ fontSize: '16px', fontWeight: '600' }}>{type}</span>
                                <span style={{
                                  fontSize: '14px',
                                  background: 'rgba(255,255,255,0.2)',
                                  padding: '2px 8px',
                                  borderRadius: '12px'
                                }}>
                                  {items.length}
                                </span>
                              </div>
                            </div>

                            {/* Items in this type */}
                            {!isCollapsed && items.map((item) => {
                              const idx = item.originalIndex
                              const typeOptions = item.type && !SPIRIT_TYPES.includes(item.type)
                                ? [item.type, ...SPIRIT_TYPES]
                                : SPIRIT_TYPES

                              return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                              padding: '12px',
                              background: '#f9fafb',
                              borderRadius: '8px',
                              marginBottom: '8px'
                            }}
                          >
                            {editingInventory ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {bulkSelectMode && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedItems.has(idx)}
                                      onChange={(e) => {
                                        const newSelected = new Set(selectedItems)
                                        if (e.target.checked) {
                                          newSelected.add(idx)
                                        } else {
                                          newSelected.delete(idx)
                                        }
                                        setSelectedItems(newSelected)
                                      }}
                                      style={{ width: '20px', height: '20px' }}
                                    />
                                    <span style={{ fontSize: '14px', fontWeight: '600' }}>Select this item</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                  <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                                    <label style={fieldLabelStyle}>Type</label>
                                    <select
                                      value={item.type}
                                      onChange={(e) => updateInventoryItem(idx, 'type', e.target.value)}
                                      style={fieldInputStyle}
                                    >
                                      {typeOptions.map((type) => (
                                        <option key={type} value={type}>
                                          {type}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ flex: '2 1 240px', minWidth: '200px' }}>
                                    <label style={fieldLabelStyle}>Name</label>
                                    <input
                                      type="text"
                                      value={item.name}
                                      onChange={(e) => updateInventoryItem(idx, 'name', e.target.value)}
                                      placeholder="Bottle name"
                                      style={fieldInputStyle}
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                  <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                                    <label style={fieldLabelStyle}>Proof</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={item.proof}
                                      onChange={(e) => updateInventoryItem(idx, 'proof', e.target.value)}
                                      placeholder="e.g. 80"
                                      style={fieldInputStyle}
                                    />
                                  </div>
                                  <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                                    <label style={fieldLabelStyle}>Bottle Size (ml)</label>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <input
                                        type="number"
                                        min="0"
                                        value={convertFromMl(item.bottleSizeMl, itemUnits[`${idx}-bottle`] || 'ml')}
                                        onChange={(e) => {
                                          const unit = itemUnits[`${idx}-bottle`] || 'ml'
                                          const mlValue = convertToMl(e.target.value, unit)
                                          updateInventoryItem(idx, 'bottleSizeMl', mlValue)
                                        }}
                                        placeholder="e.g. 750"
                                        style={{ ...fieldInputStyle, flex: 1 }}
                                      />
                                      <select
                                        value={itemUnits[`${idx}-bottle`] || 'ml'}
                                        onChange={(e) => {
                                          const newUnit = e.target.value
                                          setItemUnits({ ...itemUnits, [`${idx}-bottle`]: newUnit })
                                        }}
                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px' }}
                                      >
                                        <option value="ml">ml</option>
                                        <option value="L">L</option>
                                        <option value="oz">oz</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                                    <label style={fieldLabelStyle}>Amount Remaining</label>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={convertFromMl(item.amountRemaining, itemUnits[`${idx}-remaining`] || 'ml')}
                                        onChange={(e) => {
                                          const unit = itemUnits[`${idx}-remaining`] || 'ml'
                                          const mlValue = convertToMl(e.target.value, unit)
                                          updateInventoryItem(idx, 'amountRemaining', mlValue)
                                        }}
                                        placeholder="e.g. 300"
                                        style={{ ...fieldInputStyle, flex: 1 }}
                                      />
                                      <select
                                        value={itemUnits[`${idx}-remaining`] || 'ml'}
                                        onChange={(e) => {
                                          const newUnit = e.target.value
                                          setItemUnits({ ...itemUnits, [`${idx}-remaining`]: newUnit })
                                        }}
                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px' }}
                                      >
                                        <option value="ml">ml</option>
                                        <option value="L">L</option>
                                        <option value="oz">oz</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <label style={fieldLabelStyle}>Flavor Notes</label>
                                  <textarea
                                    value={item.flavorNotes}
                                    onChange={(e) => updateInventoryItem(idx, 'flavorNotes', e.target.value)}
                                    placeholder="Tasting notes, cocktail uses, etc."
                                    rows={3}
                                    style={{ ...fieldInputStyle, resize: 'vertical' }}
                                  />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => removeInventoryItem(idx)}
                                    style={{
                                      background: '#ef4444',
                                      color: 'white',
                                      border: 'none',
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '14px'
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontWeight: 600, fontSize: isMobile ? '14px' : '15px', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {item.name || 'Unnamed Bottle'}
                                  {shouldShowProgress(item.type) && (() => {
                                    const stockStatus = getStockLevel(
                                      parseFloat(item.amountRemaining) || 0,
                                      parseFloat(item.bottleSizeMl) || 0
                                    )
                                    return (stockStatus.level === 'critical' || stockStatus.level === 'low') ? (
                                      <span style={{
                                        fontSize: '11px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: stockStatus.color,
                                        color: 'white',
                                        marginLeft: '8px'
                                      }}>
                                        {stockStatus.label}
                                      </span>
                                    ) : null
                                  })()}
                                </div>
                                <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                                  {item.type || 'Type not set'}
                                </div>
                                <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                                  {item.proof ? `Proof: ${item.proof}` : 'Proof not set'}
                                </div>
                                <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                                  {item.bottleSizeMl ? `Bottle size: ${item.bottleSizeMl} ml` : 'Bottle size not set'}
                                </div>
                                <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#4b5563' }}>
                                  {item.amountRemaining
                                    ? `Remaining: ${item.amountRemaining} ml`
                                    : 'Amount remaining not set'}
                                </div>
                                {shouldShowProgress(item.type) && item.bottleSizeMl && item.amountRemaining && (
                                  <ProgressBar
                                    current={parseFloat(item.amountRemaining) || 0}
                                    total={parseFloat(item.bottleSizeMl) || 0}
                                  />
                                )}
                                {item.flavorNotes && (
                                  <div style={{ fontSize: isMobile ? '12px' : '13px', color: '#374151' }}>
                                    Notes: {item.flavorNotes}
                                  </div>
                                )}
                                {!editingInventory && (
                                  <>
                                    <div style={{
                                      display: 'flex',
                                      gap: '4px',
                                      marginTop: '8px',
                                      flexWrap: 'wrap'
                                    }}>
                                      <button onClick={() => quickAdjust(idx, 1)} style={{ fontSize: isMobile ? '10px' : '11px', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                        -1 oz
                                      </button>
                                      <button onClick={() => quickAdjust(idx, 1.5)} style={{ fontSize: isMobile ? '10px' : '11px', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                        -Shot (1.5oz)
                                      </button>
                                      <button onClick={() => quickAdjust(idx, 2)} style={{ fontSize: isMobile ? '10px' : '11px', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                        -2 oz
                                      </button>
                                    </div>
                                    {shouldShowProgress(item.type) && (() => {
                                      const stockStatus = getStockLevel(
                                        parseFloat(item.amountRemaining) || 0,
                                        parseFloat(item.bottleSizeMl) || 0
                                      )
                                      return (stockStatus.level === 'critical' || stockStatus.level === 'low') && (
                                        <button
                                          onClick={() => addToShoppingList(item)}
                                          style={{
                                            fontSize: isMobile ? '10px' : '11px',
                                            padding: '4px 8px',
                                            background: '#10b981',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            marginTop: '4px',
                                            width: isMobile ? '100%' : 'auto'
                                          }}
                                        >
                                          📝 Add to Shopping List
                                        </button>
                                      )
                                    })()}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                          </div>
                        )
                      })}
                    </>
                  )
                })()}

                {editingInventory && (
                  <button
                    onClick={addInventoryItem}
                    style={{
                      width: '100%',
                      background: '#f3f4f6',
                      color: '#667eea',
                      border: '2px dashed #d1d5db',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      marginTop: '8px',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    + Add Item
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {currentView === 'recipes' && (
        // Recipes View
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#f5f5f5'
          }}
        >
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Custom Recipes & Favorites</h2>
              {!creatingRecipe && !editingRecipe && (
                <button
                  onClick={() => setCreatingRecipe(true)}
                  style={{
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  + New Recipe
                </button>
              )}
            </div>

            {creatingRecipe || editingRecipe ? (
              <RecipeBuilder
                recipe={editingRecipe}
                inventory={inventory}
                onSave={saveRecipe}
                onCancel={() => {
                  setCreatingRecipe(false)
                  setEditingRecipe(null)
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {customRecipes.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#666', padding: '40px 0' }}>
                    <p>No recipes yet!</p>
                    <p style={{ fontSize: '14px', marginTop: '8px' }}>Create your first custom recipe to get started.</p>
                  </div>
                ) : (
                  customRecipes.map(recipe => (
                    <RecipeCard
                      key={`${recipe.id}-${inventory.length}`}
                      recipe={recipe}
                      inventory={inventory}
                      onEdit={setEditingRecipe}
                      onDelete={deleteRecipe}
                      onMake={makeRecipe}
                      onAddToShoppingList={addToShoppingList}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
