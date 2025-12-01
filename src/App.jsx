import React, { useState, useEffect, useRef, memo } from 'react'
import MenuEditor from './components/MenuEditor'

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
// #22: Memoized to prevent unnecessary re-renders
const ProgressBar = memo(function ProgressBar({ current, total }) {
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
});

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
  'Aperitif',
  'Beer',
  'Bitters',
  'Bourbon',
  'Brandy',
  'Cognac',
  'Digestif',
  'Garnish',
  'Gin',
  'Liqueur',
  'Mezcal',
  'Mixer',
  'Rum',
  'Rye',
  'Scotch',
  'Syrup',
  'Tequila',
  'Tool',
  'Vermouth',
  'Vodka',
  'Whiskey',
  'Wine',
  'Other'
]

const createEmptyInventoryItem = () => ({
  type: 'Vodka', // Default to Vodka as most common spirit
  brand: '',
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
    brand: item.brand ? String(item.brand) : '',
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

const shouldSkipFlavorNotes = (item = {}) => {
  const skippedTypes = ['tool', 'other']
  const type = (item.type || '').toLowerCase()
  return skippedTypes.includes(type)
}

const countItemsMissingFlavorNotes = (items = []) =>
  items.filter(item => {
    if (shouldSkipFlavorNotes(item)) return false
    const hasName = item.name && item.name.trim().length > 0
    const hasNotes = item.flavorNotes && item.flavorNotes.trim().length > 0
    return hasName && !hasNotes
  }).length

const PurpleMoonIcon = ({ size = 24, style = {} }) => (
  <img
    src="/purple-moon-logo.png"
    alt="Purple moon"
    width={size}
    height={size}
    loading="lazy"
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      objectFit: 'contain',
      ...style
    }}
  />
)

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
    item.brand,
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
// #22: Memoized to prevent unnecessary re-renders
const RecipeBuilder = memo(function RecipeBuilder({ recipe, inventory, onSave, onCancel }) {
  const [name, setName] = useState(recipe?.name || '')
  const [ingredients, setIngredients] = useState(recipe?.ingredients || [])
  const [instructions, setInstructions] = useState(recipe?.instructions || '')
  const [glass, setGlass] = useState(recipe?.glass || '')
  const [garnish, setGarnish] = useState(recipe?.garnish || '')
  const [tags, setTags] = useState(recipe?.tags || '')

  const inventoryOptions = (() => {
    const seen = new Set()
    return inventory
      .map(item => {
        const labelParts = []
        if (item.brand) labelParts.push(item.brand)
        if (item.name) labelParts.push(item.name)
        const typeLabel = item.type ? ` (${item.type})` : ''
        return {
          value: item.name || '',
          label: `${labelParts.join(' · ')}${typeLabel}`.trim() || item.name || 'Unnamed bottle'
        }
      })
      .filter(option => {
        const key = option.value.toLowerCase().trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  })()

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
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>Ingredient</label>
              <input
                type="text"
                list={`ingredient-options-${idx}`}
                value={ing.name}
                onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                placeholder="Start typing an ingredient..."
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
              />
              <datalist id={`ingredient-options-${idx}`}>
                {inventoryOptions.map((option, optionIdx) => (
                  <option key={`${option.value}-${optionIdx}`} value={option.value} label={option.label} />
                ))}
              </datalist>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>Amount</label>
                <input
                  type="number"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
                  placeholder="2"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>Unit</label>
                <select
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                >
                  <option value="ml">ml</option>
                  <option value="oz">oz</option>
                  <option value="dash">dash</option>
                  <option value="tsp">tsp</option>
                </select>
              </div>
              <button
                onClick={() => removeIngredient(idx)}
                style={{ padding: '8px 12px', minHeight: '38px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}
                aria-label="Remove ingredient"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addIngredient}
          style={{
            width: '100%',
            padding: '12px 16px',
            minHeight: '44px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            touchAction: 'manipulation'
          }}
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

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Glassware</label>
        <input
          type="text"
          value={glass}
          onChange={(e) => setGlass(e.target.value)}
          placeholder="e.g., Martini"
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Garnish</label>
        <input
          type="text"
          value={garnish}
          onChange={(e) => setGarnish(e.target.value)}
          placeholder="e.g., Lime wheel"
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
        />
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
          style={{ flex: 1, padding: '12px', minHeight: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
        >
          {recipe ? 'Update Recipe' : 'Save Recipe'}
        </button>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '12px', minHeight: '44px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
});

// Add Inventory Item Modal Component
function AddInventoryModal({ isOpen, onClose, item, onUpdateItem, onSaveAndAddAnother, onSaveAndClose, bottleUnit, remainingUnit, onBottleUnitChange, onRemainingUnitChange, isMobile, isGenerating }) {
  if (!isOpen) return null

  const fieldInputStyle = {
    padding: isMobile ? '10px' : '8px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: isMobile ? '16px' : '14px',
    width: '100%'
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: isMobile ? '20px 20px 0 0' : '12px',
          padding: isMobile ? '20px' : '24px',
          paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom))' : '24px',
          maxWidth: isMobile ? '100%' : '500px',
          width: '100%',
          maxHeight: isMobile ? '85vh' : '90vh',
          overflowY: 'auto',
          boxShadow: '0 -10px 25px -5px rgba(0, 0, 0, 0.1), 0 -10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideUp 0.3s ease',
          margin: isMobile ? '0' : '16px auto',
          position: 'relative'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.05)',
            border: 'none',
            borderRadius: '50%',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#6b7280',
            transition: 'all 0.2s',
            zIndex: 1
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
          aria-label="Close"
        >
          ✕
        </button>
        <h2 style={{ margin: '0 0 20px 0', fontSize: isMobile ? '20px' : '18px', paddingRight: '40px' }}>Add Inventory Item</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Type */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Type *</label>
            <select
              value={item.type}
              onChange={(e) => onUpdateItem('type', e.target.value)}
              style={fieldInputStyle}
            >
              {SPIRIT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Brand */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Brand</label>
            <input
              type="text"
              value={item.brand}
              onChange={(e) => onUpdateItem('brand', e.target.value)}
              placeholder="e.g. Absolut"
              style={fieldInputStyle}
            />
          </div>

          {/* Name */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Name *</label>
            <input
              type="text"
              value={item.name}
              onChange={(e) => onUpdateItem('name', e.target.value)}
              placeholder="e.g. Grey Goose Vodka"
              style={fieldInputStyle}
              autoFocus
            />
          </div>

          {/* Proof */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Proof</label>
            <input
              type="number"
              min="0"
              value={item.proof}
              onChange={(e) => onUpdateItem('proof', e.target.value)}
              placeholder="e.g. 80"
              style={fieldInputStyle}
            />
          </div>

          {/* Bottle Size */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Bottle Size</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                min="0"
                value={convertFromMl(item.bottleSizeMl, bottleUnit)}
                onChange={(e) => {
                  const mlValue = convertToMl(e.target.value, bottleUnit)
                  onUpdateItem('bottleSizeMl', mlValue)
                }}
                placeholder="e.g. 750"
                style={{ ...fieldInputStyle, flex: 1 }}
              />
              <select
                value={bottleUnit}
                onChange={(e) => onBottleUnitChange(e.target.value)}
                style={{ ...fieldInputStyle, flex: '0 0 80px' }}
              >
                <option value="ml">ml</option>
                <option value="oz">oz</option>
                <option value="L">L</option>
              </select>
            </div>
          </div>

          {/* Amount Remaining */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Amount Remaining</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                min="0"
                step="any"
                value={convertFromMl(item.amountRemaining, remainingUnit)}
                onChange={(e) => {
                  const mlValue = convertToMl(e.target.value, remainingUnit)
                  onUpdateItem('amountRemaining', mlValue)
                }}
                placeholder="e.g. 750"
                style={{ ...fieldInputStyle, flex: 1 }}
              />
              <select
                value={remainingUnit}
                onChange={(e) => onRemainingUnitChange(e.target.value)}
                style={{ ...fieldInputStyle, flex: '0 0 80px' }}
              >
                <option value="ml">ml</option>
                <option value="oz">oz</option>
                <option value="L">L</option>
              </select>
            </div>
          </div>

          {/* Flavor Notes */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>
              Flavor Notes
              {isGenerating && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#667eea' }}>(AI generating...)</span>}
            </label>
            <textarea
              value={item.flavorNotes}
              onChange={(e) => onUpdateItem('flavorNotes', e.target.value)}
              placeholder={isGenerating ? "AI is crafting flavor notes..." : "Tasting notes, cocktail uses, etc."}
              rows={3}
              style={{ ...fieldInputStyle, resize: 'vertical' }}
              disabled={isGenerating}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
          <button
            onClick={onSaveAndAddAnother}
            disabled={!item.name.trim()}
            style={{
              flex: 1,
              minWidth: '140px',
              minHeight: '44px',
              padding: isMobile ? '12px' : '10px',
              background: item.name.trim() ? '#667eea' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: item.name.trim() ? 'pointer' : 'not-allowed',
              fontSize: isMobile ? '16px' : '14px',
              fontWeight: '600'
            }}
          >
            Save & Add Another
          </button>
          <button
            onClick={onSaveAndClose}
            disabled={!item.name.trim()}
            style={{
              flex: 1,
              minWidth: '100px',
              minHeight: '44px',
              padding: isMobile ? '12px' : '10px',
              background: item.name.trim() ? '#10b981' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: item.name.trim() ? 'pointer' : 'not-allowed',
              fontSize: isMobile ? '16px' : '14px',
              fontWeight: '600'
            }}
          >
            Done
          </button>
          <button
            onClick={onClose}
            style={{
              flex: '0 0 auto',
              minHeight: '44px',
              padding: isMobile ? '12px 16px' : '10px 14px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: isMobile ? '16px' : '14px'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// Recipe Card Component with Flexible Ingredient Matching
// #22: Memoized to prevent unnecessary re-renders
const RecipeCard = memo(function RecipeCard({ recipe, inventory, onEdit, onDelete, onMake, onAddToShoppingList }) {
  const [expanded, setExpanded] = useState(false)
  const [showBottleSelection, setShowBottleSelection] = useState(false)
  const [selectedBottles, setSelectedBottles] = useState({})

  // Helper function to check if an item matches an ingredient
  const itemMatchesIngredient = (item, ingNameLower) => {
    const itemNameLower = item.name.toLowerCase().trim()
    const itemTypeLower = (item.type || '').toLowerCase().trim()
    const itemBrandLower = (item.brand || '').toLowerCase().trim()

    // Exact match (case-insensitive)
    if (itemNameLower === ingNameLower) {
      return true
    }

    // Base spirit types that we should match by TYPE field
    const baseSpirits = ['vodka', 'rum', 'gin', 'whiskey', 'whisky', 'tequila', 'bourbon', 'brandy', 'cognac', 'scotch', 'rye', 'mezcal']

    // Wine categories for generic wine matching
    const redWines = ['cabernet', 'merlot', 'pinot noir', 'syrah', 'shiraz', 'malbec', 'zinfandel', 'sangiovese', 'tempranillo', 'grenache', 'barbera', 'nebbiolo', 'petite sirah', 'carmenere']
    const whiteWines = ['chardonnay', 'sauvignon blanc', 'pinot grigio', 'pinot gris', 'riesling', 'moscato', 'gewurztraminer', 'viognier', 'chenin blanc', 'semillon', 'albarino', 'vermentino']
    const roseWines = ['rosé', 'rose', 'blush']

    // Check for generic wine descriptors
    const isRedWineRequest = ingNameLower.includes('red wine') ||
                              ingNameLower === 'red' && itemTypeLower === 'wine'
    const isWhiteWineRequest = ingNameLower.includes('white wine')
    const isRoseWineRequest = ingNameLower.includes('rosé') ||
                               ingNameLower.includes('rose wine') ||
                               ingNameLower.includes('blush wine')

    if (isRedWineRequest) {
      return redWines.some(redWine =>
        itemNameLower.includes(redWine) ||
        itemBrandLower.includes(redWine)
      ) && (itemTypeLower === 'wine' || itemTypeLower === '')
    }
    if (isWhiteWineRequest) {
      return whiteWines.some(whiteWine =>
        itemNameLower.includes(whiteWine) ||
        itemBrandLower.includes(whiteWine)
      ) && (itemTypeLower === 'wine' || itemTypeLower === '')
    }
    if (isRoseWineRequest) {
      return roseWines.some(rose =>
        itemNameLower.includes(rose) ||
        itemBrandLower.includes(rose)
      ) && (itemTypeLower === 'wine' || itemTypeLower === '')
    }

    // Specific ingredients that need exact/partial name matching
    const specificIngredients = ['prosecco', 'champagne', 'wine', 'chardonnay', 'pinot', 'merlot', 'cabernet', 'sake', 'vermouth', 'sherry', 'port', 'madeira']

    // Check if recipe wants a plain base spirit
    if (baseSpirits.includes(ingNameLower)) {
      if (itemTypeLower === ingNameLower) {
        const flavorWords = ['apple', 'green', 'cherry', 'vanilla', 'citrus', 'spiced', 'coconut', 'pineapple', 'mango', 'peach', 'raspberry', 'strawberry', 'blueberry', 'blackberry']
        const nameHasFlavor = flavorWords.some(flavor => itemNameLower.includes(flavor))
        if (!nameHasFlavor) {
          return true
        }
      }
      return false
    }

    // Check for flavored spirits
    const ingWords = ingNameLower.split(/\s+/)
    const hasBaseSpirit = ingWords.some(word => baseSpirits.includes(word))

    if (hasBaseSpirit) {
      const spiritType = ingWords.find(word => baseSpirits.includes(word))
      if (itemTypeLower !== spiritType) return false
      const combinedText = `${itemNameLower} ${itemBrandLower} ${(item.flavorNotes || '').toLowerCase()}`
      const flavorWords = ingWords.filter(word => !baseSpirits.includes(word))
      return flavorWords.every(word => combinedText.includes(word))
    }

    // Check for specific ingredients
    if (specificIngredients.some(specific => ingNameLower.includes(specific))) {
      return itemNameLower.includes(ingNameLower) ||
             ingNameLower.includes(itemNameLower) ||
             (itemBrandLower && ingNameLower.includes(itemBrandLower))
    }

    // Generic word matching
    const recipeWords = ingNameLower.split(/\s+/).filter(w => w.length > 2)
    const flavorNoteLower = (item.flavorNotes || '').toLowerCase()
    return recipeWords.every(word =>
      itemNameLower.includes(word) ||
      itemBrandLower.includes(word) ||
      flavorNoteLower.includes(word)
    )
  }

  // Check if we have all ingredients with flexible matching
  const checkIngredients = () => {
    return recipe.ingredients.map(ing => {
      const ingNameLower = ing.name.toLowerCase().trim()

      // Find ALL matching items (not just first one)
      const allMatches = inventory.filter(item => itemMatchesIngredient(item, ingNameLower))

      // Use the selected bottle if user has chosen, otherwise use first match
      const invItem = selectedBottles[ing.name]
        ? inventory.find(item => item.name === selectedBottles[ing.name])
        : allMatches[0]

      // Store all matches for selection dialog
      const hasMultipleOptions = allMatches.length > 1

      if (!invItem) return {
        ...ing,
        available: false,
        remaining: 0,
        allMatches: [],
        hasMultipleOptions: false
      }

      // For pantry items (garnish, tools, etc.), existence = availability
      const pantryTypes = ['other', 'garnish', 'tool', 'bitters', 'syrup']
      const isPantryItem = pantryTypes.includes((invItem.type || '').toLowerCase())

      if (isPantryItem) {
        // Pantry items don't need quantity tracking - if it exists, it's available
        return {
          ...ing,
          available: true,
          remaining: 999999,
          matchedItem: invItem.name,
          matchedBrand: invItem.brand || '',
          allMatches,
          hasMultipleOptions
        }
      }

      // For spirits/liquids, check quantity
      const neededMl = ing.unit === 'oz' ? parseFloat(ing.amount) * 30 : parseFloat(ing.amount)
      const remaining = parseFloat(invItem.amountRemaining)

      // If amount is not a number (empty, "In Stock", etc.), treat as available
      if (isNaN(remaining)) {
        return {
          ...ing,
          available: true,
          remaining: 999999,
          matchedItem: invItem.name,
          matchedBrand: invItem.brand || '',
          allMatches,
          hasMultipleOptions
        }
      }

      return {
        ...ing,
        available: remaining >= neededMl,
        remaining,
        matchedItem: invItem.name,
        matchedBrand: invItem.brand || '',
        allMatches,
        hasMultipleOptions
      }
    })
  }

  const ingredientStatus = checkIngredients()
  const canMake = ingredientStatus.every(ing => ing.available)
  const missingIngredients = ingredientStatus.filter(ing => !ing.available)

  const handleMakeRecipe = () => {
    // Check if any ingredients have multiple options
    const ingredientsWithOptions = ingredientStatus.filter(ing => ing.hasMultipleOptions)

    if (ingredientsWithOptions.length > 0) {
      // Show bottle selection dialog
      setShowBottleSelection(true)
    } else {
      // No choices needed, make the drink directly
      executeRecipe()
    }
  }

  const executeRecipe = () => {
    const updates = ingredientStatus
      .filter(ing => ing.matchedItem)
      .map(ing => {
        const mlAmount = ing.unit === 'oz' ? parseFloat(ing.amount) * 30 : parseFloat(ing.amount)
        return {
          name: ing.matchedItem,
          subtract: mlAmount,
          ingredient: ing.name,
          brand: ing.matchedBrand,
          amount: ing.amount,
          unit: ing.unit
        }
      })

    // Build detailed confirmation message
    const bottleList = updates
      .map(u => {
        const brandPrefix = u.brand ? `${u.brand} ` : ''
        const amountText = `${u.amount} ${u.unit}`
        if (u.ingredient.toLowerCase() === u.name.toLowerCase()) {
          // Exact match - just show the amount
          return `  • ${brandPrefix}${u.name}: ${amountText}`
        } else {
          // Generic ingredient matched to specific bottle
          return `  • ${u.ingredient}: ${amountText} (using ${brandPrefix}${u.name})`
        }
      })
      .join('\n')

    onMake(updates)
    alert(`Made ${recipe.name}!\n\nUsed from inventory:\n${bottleList}\n\nInventory updated.`)
    setShowBottleSelection(false)
    setSelectedBottles({})
  }

  const addMissingToShoppingList = () => {
    missingIngredients.forEach(ing => {
      onAddToShoppingList({
        name: ing.name,
        brand: ing.matchedBrand || '',
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
          <button onClick={() => onEdit(recipe)} style={{ padding: '8px 12px', minHeight: '44px', minWidth: '44px', fontSize: '13px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
          <button onClick={() => { if (confirm(`Delete ${recipe.name}?`)) onDelete(recipe.id) }} style={{ padding: '8px 12px', minHeight: '44px', minWidth: '44px', fontSize: '13px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ fontSize: '14px' }}>Ingredients:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '14px', lineHeight: '1.6' }}>
          {ingredientStatus.map((ing, idx) => (
            <li key={idx} style={{ color: ing.available ? '#059669' : '#dc2626' }}>
              <span style={{ fontWeight: '600' }}>{ing.name}</span>: {ing.amount} {ing.unit}
              {ing.available ? (
                <>
                  {' ✓'}
                  {ing.matchedItem && ing.matchedItem.toLowerCase() !== ing.name.toLowerCase() && (
                    <span style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                      {' '}(using {ing.matchedBrand ? `${ing.matchedBrand} ` : ''}{ing.matchedItem})
                    </span>
                  )}
                </>
              ) : (
                ' ✗ Missing'
              )}
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
          style={{ flex: 1, minWidth: '120px', padding: '12px', minHeight: '44px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
        <button
          onClick={handleMakeRecipe}
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

      {/* Bottle Selection Modal */}
      {showBottleSelection && (
        <div
          onClick={() => setShowBottleSelection(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setShowBottleSelection(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.05)',
                border: 'none',
                borderRadius: '50%',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#6b7280',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              aria-label="Close"
            >
              ✕
            </button>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '600', paddingRight: '40px' }}>
              Select Bottles
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#6b7280' }}>
              Multiple options found. Choose which bottle to use for each ingredient:
            </p>

            {ingredientStatus
              .filter(ing => ing.hasMultipleOptions)
              .map((ing, idx) => (
                <div key={idx} style={{ marginBottom: '24px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <strong style={{ fontSize: '16px', color: '#111' }}>{ing.name}</strong>
                    <span style={{ fontSize: '14px', color: '#6b7280', marginLeft: '8px' }}>
                      ({ing.amount} {ing.unit})
                    </span>
                  </div>

                  {ing.allMatches.map((match, matchIdx) => {
                    const matchName = match.name
                    const isSelected = selectedBottles[ing.name] === matchName ||
                                       (!selectedBottles[ing.name] && matchIdx === 0)

                    return (
                      <label
                        key={matchIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px',
                          marginBottom: '8px',
                          background: isSelected ? '#eff6ff' : 'white',
                          border: isSelected ? '2px solid #3b82f6' : '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#f3f4f6'
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'white'
                        }}
                      >
                        <input
                          type="radio"
                          name={`bottle-${ing.name}`}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedBottles(prev => ({
                              ...prev,
                              [ing.name]: matchName
                            }))
                          }}
                          style={{ marginRight: '12px', width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>
                            {match.brand && `${match.brand} `}{match.name}
                          </div>
                          {match.amountRemaining && !isNaN(parseFloat(match.amountRemaining)) && (
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                              {Math.round(parseFloat(match.amountRemaining))} ml remaining
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              ))}

            <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <button
                onClick={executeRecipe}
                style={{
                  flex: 1,
                  padding: '12px',
                  minHeight: '44px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600'
                }}
              >
                Make Drink
              </button>
              <button
                onClick={() => {
                  setShowBottleSelection(false)
                  setSelectedBottles({})
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  minHeight: '44px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
});

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

  // Data loading state to prevent race conditions on save
  const [dataLoaded, setDataLoaded] = useState({
    shopping: false,
    recipes: false
  })

  // Add Item Modal state
  const [addItemModalOpen, setAddItemModalOpen] = useState(false)
  const [modalItem, setModalItem] = useState(createEmptyInventoryItem())
  const [modalBottleUnit, setModalBottleUnit] = useState('ml')
  const [modalRemainingUnit, setModalRemainingUnit] = useState('ml')

  // New UI/UX enhancement state
  const [shoppingList, setShoppingList] = useState([])
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // #7: Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    if (saved !== null) return saved === 'true'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false
  })

  // #5: Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  // #9: FAB (Floating Action Button) state
  const [fabMenuOpen, setFabMenuOpen] = useState(false)

  // Maintenance menu state for inventory utilities
  const [maintenanceMenuOpen, setMaintenanceMenuOpen] = useState(false)

  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null) // For pull-to-refresh

  // #3: Haptic feedback utility
  const hapticFeedback = (type = 'light') => {
    if (!navigator.vibrate) return
    const patterns = {
      light: 10,
      medium: 20,
      heavy: 30,
      success: [10, 50, 10],
      error: [20, 100, 20]
    }
    navigator.vibrate(patterns[type] || patterns.light)
  }

  const fieldLabelStyle = {
    display: 'block',
    fontSize: '13px',
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
      setDataLoaded(prev => ({ ...prev, recipes: true }))
    } catch (error) {
      console.error('Failed to load recipes:', error)
      setDataLoaded(prev => ({ ...prev, recipes: true }))
    }
  }

  const loadShopping = async () => {
    try {
      console.log('[Shopping] Loading shopping list from backend...')
      const response = await fetch(`${WORKER_URL}/shopping`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      const loadedList = data.shopping || []
      console.log(`[Shopping] Loaded ${loadedList.length} items:`, loadedList)
      setShoppingList(loadedList)
      setDataLoaded(prev => ({ ...prev, shopping: true }))
    } catch (error) {
      console.error('[Shopping] Failed to load shopping list:', error)
      // Don't overwrite with empty array on error - keep what we have
      setDataLoaded(prev => ({ ...prev, shopping: true }))
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
      console.log(`[Shopping] Saving ${shopping.length} items to backend:`, shopping)
      const response = await fetch(`${WORKER_URL}/shopping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopping })
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      console.log('[Shopping] Save successful')
    } catch (error) {
      console.error('[Shopping] Failed to save shopping list:', error)
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

  // Save recipes to backend (only after initial load completes)
  useEffect(() => {
    if (dataLoaded.recipes && customRecipes.length > 0) {
      saveRecipes(customRecipes)
    }
  }, [customRecipes, dataLoaded.recipes])

  // Save shopping list to backend (only after initial load completes to prevent race condition)
  useEffect(() => {
    if (dataLoaded.shopping) {
      saveShopping(shoppingList)
    }
  }, [shoppingList, dataLoaded.shopping])

  // Auto-remove shopping list items when they appear in inventory
  useEffect(() => {
    if (shoppingList.length === 0 || inventory.length === 0 || !dataLoaded.shopping) return

    const itemsToRemove = shoppingList.filter(shopItem => {
      return inventory.some(invItem => {
        const shopNameLower = shopItem.name.toLowerCase().trim()
        const invNameLower = invItem.name.toLowerCase().trim()
        const invTypeLower = (invItem.type || '').toLowerCase().trim()
        const invBrandLower = (invItem.brand || '').toLowerCase().trim()

        // Match logic (in order of specificity):
        // 1. Exact name match (e.g., "Grey Goose Vodka" === "Grey Goose Vodka")
        if (invNameLower === shopNameLower) return true

        // 2. Shopping item matches inventory type exactly (e.g., "vodka" === type:"Vodka")
        if (invTypeLower === shopNameLower) return true

        // 3. Brand + name match for specific branded items
        if (invBrandLower && shopItem.brand) {
          const shopBrandLower = shopItem.brand.toLowerCase().trim()
          if (invBrandLower === shopBrandLower && invNameLower === shopNameLower) {
            return true
          }
        }

        // 4. Smart substring match: Shopping item is a "word" contained in inventory name
        //    AND shopping item is at least 4 chars (prevents matching "gin" in "ginger")
        //    Example: shopping "vodka" matches inventory "Grey Goose Vodka"
        if (shopNameLower.length >= 4) {
          // Use word boundaries to prevent false matches
          const wordBoundaryPattern = new RegExp(`\\b${shopNameLower}\\b`)
          if (wordBoundaryPattern.test(invNameLower)) return true

          // Also check if shopping item matches the type as a word
          if (wordBoundaryPattern.test(invTypeLower)) return true
        }

        return false
      })
    })

    if (itemsToRemove.length > 0) {
      console.log(`[Shopping] Auto-removing ${itemsToRemove.length} item(s) (now in inventory):`, itemsToRemove)
      const updatedList = shoppingList.filter(shopItem =>
        !itemsToRemove.some(removed => removed.name === shopItem.name)
      )
      setShoppingList(updatedList)
    }
  }, [inventory, shoppingList, dataLoaded.shopping])

  // Save chat messages to backend
  useEffect(() => {
    saveChatHistory(messages)
  }, [messages])

  // Mobile responsive resize handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // #7: Dark mode persistence
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode)
    document.body.classList.toggle('dark-mode', darkMode)
  }, [darkMode])

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
        if (shouldSkipFlavorNotes(item)) return false
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

    hapticFeedback('light') // #3: Haptic feedback on send
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
        const detailText = data.details ? ` (${data.details})` : ''
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error}${detailText ? ` - ${detailText}` : ''}`
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

  // Modal functions
  const openAddItemModal = () => {
    setModalItem(createEmptyInventoryItem())
    setModalBottleUnit('ml')
    setModalRemainingUnit('ml')
    setAddItemModalOpen(true)
  }

  const closeAddItemModal = () => {
    setAddItemModalOpen(false)
    setModalItem(createEmptyInventoryItem())
    setModalBottleUnit('ml')
    setModalRemainingUnit('ml')
  }

  const saveModalItem = async () => {
    // Add the item at the beginning so it appears at the top
    const newInventory = [modalItem, ...inventory]

    // Auto-generate flavor notes for the new item if it has a name but no notes
    if (modalItem.name && modalItem.name.trim().length > 0 &&
        (!modalItem.flavorNotes || modalItem.flavorNotes.trim().length === 0)) {
      try {
        setGeneratingNotes(true)
        const enrichResponse = await fetch(`${WORKER_URL}/enrich-inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory: newInventory })
        })

        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json()
          const enrichedInventory = ensureInventoryShape(enrichData.inventory || newInventory)
          setInventory(enrichedInventory)
          setGeneratingNotes(false)
          return true
        }
      } catch (error) {
        console.error('Failed to enrich new item:', error)
      }
      setGeneratingNotes(false)
    }

    setInventory(newInventory)
    return true
  }

  const saveAndAddAnother = async () => {
    await saveModalItem()
    // Clear form for next item
    setModalItem(createEmptyInventoryItem())
    setModalBottleUnit('ml')
    setModalRemainingUnit('ml')
  }

  const saveAndClose = async () => {
    await saveModalItem()
    closeAddItemModal()
  }

  const updateModalItem = (field, value) => {
    setModalItem({ ...modalItem, [field]: value })
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
    const headers = ['Type', 'Brand', 'Name', 'Proof', 'Bottle Size (ml)', 'Amount Remaining (ml)', 'Flavor Notes']
    const rows = inventory.map(item => [
      item.type || '', item.brand || '', item.name || '', item.proof || '',
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
    const normalize = (value) => (value || '').toLowerCase()
    if (shoppingList.some(i =>
      normalize(i.name) === normalize(item.name) &&
      normalize(i.brand) === normalize(item.brand)
    )) {
      // Already exists - skip silently
      return
    }
    setShoppingList([...shoppingList, {
      name: item.name,
      brand: item.brand || '',
      type: item.type || 'Recipe Ingredient',
      size: item.bottleSizeMl || item.size,
      amount: item.amount, // For recipe ingredients
      added: Date.now()
    }])
  }

  // #5: Pull-to-refresh handlers for inventory
  const inventoryRef = useRef(null)
  const pullStartY = useRef(0)
  const pullThreshold = 80

  const handlePullStart = (e) => {
    if (currentView !== 'inventory' || !inventoryRef.current) return
    const scrollTop = inventoryRef.current.scrollTop
    if (scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY
    }
  }

  const handlePullMove = (e) => {
    if (currentView !== 'inventory' || !inventoryRef.current) return
    const scrollTop = inventoryRef.current.scrollTop

    if (scrollTop === 0 && pullStartY.current > 0) {
      const currentY = e.touches[0].clientY
      const distance = Math.max(0, currentY - pullStartY.current)

      if (distance > 0) {
        e.preventDefault()
        setPullDistance(Math.min(distance, pullThreshold * 1.5))
      }
    }
  }

  const handlePullEnd = async () => {
    if (currentView !== 'inventory') return

    if (pullDistance >= pullThreshold && !refreshing) {
      setRefreshing(true)
      hapticFeedback('success')

      try {
        await loadInventory()
        await new Promise(resolve => setTimeout(resolve, 500)) // Brief delay for UX
        hapticFeedback('light')
      } catch (error) {
        console.error('Refresh failed:', error)
        hapticFeedback('error')
      } finally {
        setRefreshing(false)
      }
    }

    setPullDistance(0)
    pullStartY.current = 0
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

    // Sort items alphabetically by name within each category (only when not editing)
    if (!editingInventory) {
      Object.keys(grouped).forEach(type => {
        grouped[type].sort((a, b) => {
          const nameA = (a.name || '').toLowerCase()
          const nameB = (b.name || '').toLowerCase()
          return nameA.localeCompare(nameB)
        })
      })
    }

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
              <PurpleMoonIcon size={26} />
              <span style={{ fontSize: '24px', fontWeight: 700 }}>Purple Moonz</span>
            </a>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
              AI-powered home bartending
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* #7: Dark mode toggle */}
            <button
              type="button"
              onClick={() => {
                hapticFeedback('light')
                setDarkMode(prev => !prev)
              }}
              style={{
                padding: '10px 12px',
                fontSize: '18px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                minHeight: '44px',
                minWidth: '44px'
              }}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? '☀️' : <PurpleMoonIcon size={20} />}
            </button>
            <button
              type="button"
              onClick={() => { hapticFeedback('light'); setShowTomInfo(prev => !prev); }}
              style={{
                padding: '10px 12px',
                fontSize: '12px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                minHeight: '44px'
              }}
            >
              powered by Tom Bullock
            </button>
          </div>
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
              padding: '12px',
              minHeight: '48px',
              background: currentView === 'chat' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: currentView === 'chat' ? '600' : '400',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setCurrentView('inventory')}
            style={{
              flex: 1,
              padding: '12px',
              minHeight: '48px',
              background: currentView === 'inventory' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: currentView === 'inventory' ? '600' : '400',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            Inventory ({inventory.length})
          </button>
          <button
            onClick={() => setCurrentView('recipes')}
            style={{
              flex: 1,
              padding: '12px',
              minHeight: '48px',
              background: currentView === 'recipes' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: currentView === 'recipes' ? '600' : '400',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            Favorites ({customRecipes.length})
          </button>
          <button
            onClick={() => setCurrentView('menu')}
            style={{
              flex: 1,
              padding: '12px',
              minHeight: '48px',
              background: currentView === 'menu' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: currentView === 'menu' ? '600' : '400',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            📋 Menu
          </button>
        </div>
      </div>

      {/* Main Content - Three-Way View Switching */}
      {currentView === 'chat' && (
        <>
          {/* Chat Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              paddingBottom: isMobile ? '100px' : '16px', // #2: Space for fixed input on mobile
              background: '#f5f5f5'
            }}
          >
            {messages.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all chat history?')) {
                    setMessages([])
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

          {/* Input - #2: Sticky on mobile */}
          <div style={{
            padding: '16px',
            paddingBottom: isMobile ? `calc(16px + env(safe-area-inset-bottom))` : '16px',
            background: 'white',
            borderTop: '1px solid #e0e0e0',
            ...(isMobile ? {
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
              boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
            } : {})
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
                  minHeight: '44px', // #4: Larger touch target
                  minWidth: '80px', // #4: Larger touch target
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
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
          ref={inventoryRef}
          onTouchStart={handlePullStart}
          onTouchMove={handlePullMove}
          onTouchEnd={handlePullEnd}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#f5f5f5',
            position: 'relative'
          }}
        >
          {/* #5: Pull-to-refresh indicator */}
          {pullDistance > 0 && (
            <div style={{
              position: 'absolute',
              top: '0',
              left: '50%',
              transform: `translateX(-50%) translateY(${Math.min(pullDistance - 20, 60)}px)`,
              zIndex: 1000,
              transition: refreshing ? 'transform 0.3s ease' : 'none',
              pointerEvents: 'none'
            }}>
              <div style={{
                background: 'white',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                opacity: Math.min(pullDistance / pullThreshold, 1)
              }}>
                {refreshing ? (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '3px solid #667eea',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                ) : (
                  <span style={{
                    fontSize: '20px',
                    transform: pullDistance >= pullThreshold ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}>
                    ↓
                  </span>
                )}
              </div>
            </div>
          )}
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
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Bar Inventory</h2>
              {!editingInventory ? (
                <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      hapticFeedback('light')
                      setMaintenanceMenuOpen(!maintenanceMenuOpen)
                    }}
                    style={{
                      background: maintenanceMenuOpen ? '#6b7280' : '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '18px',
                      minHeight: '40px',
                      minWidth: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    aria-label="Maintenance menu"
                  >
                    ⋮
                  </button>

                  {/* Maintenance dropdown menu */}
                  {maintenanceMenuOpen && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        onClick={() => setMaintenanceMenuOpen(false)}
                        style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 999
                        }}
                      />

                      {/* Menu popup */}
                      <div style={{
                        position: 'absolute',
                        top: '48px',
                        right: '0',
                        background: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        padding: '8px',
                        zIndex: 1000,
                        minWidth: '200px',
                        animation: 'fadeIn 0.2s ease'
                      }}>
                        <button
                          onClick={() => {
                            setMaintenanceMenuOpen(false)
                            exportToCSV()
                          }}
                          style={{
                            width: '100%',
                            background: 'transparent',
                            color: '#111',
                            border: 'none',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <span>📥</span> Export CSV
                        </button>
                        <button
                          onClick={() => {
                            setMaintenanceMenuOpen(false)
                            exportToJSON()
                          }}
                          style={{
                            width: '100%',
                            background: 'transparent',
                            color: '#111',
                            border: 'none',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <span>📤</span> Export JSON
                        </button>
                        <button
                          onClick={() => {
                            setMaintenanceMenuOpen(false)
                            importFromJSON()
                          }}
                          style={{
                            width: '100%',
                            background: 'transparent',
                            color: '#111',
                            border: 'none',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <span>📂</span> Import JSON
                        </button>
                        <button
                          onClick={async () => {
                            setMaintenanceMenuOpen(false)
                      const initialMissing = countItemsMissingFlavorNotes(inventory)

                      if (initialMissing === 0) {
                        alert('All items already have flavor notes!')
                        return
                      }

                      const batchSize = 5
                      const estimatedBatches = Math.ceil(initialMissing / batchSize)

                      if (!confirm(`Generate AI flavor notes for ${initialMissing} item(s)? This will auto-run in batches of ${batchSize} (about ${estimatedBatches} batch(es)).`)) {
                        return
                      }

                      setGeneratingNotes(true)
                      let currentInventory = ensureInventoryShape(inventory)
                      let processedCount = 0
                      let remainingMissing = initialMissing
                      let iteration = 1

                      try {
                        while (remainingMissing > 0) {
                          setNoteStatus(`Batch ${iteration}: ${remainingMissing} item(s) still missing notes...`)

                          const enrichResponse = await fetch(`${WORKER_URL}/enrich-inventory`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ inventory: currentInventory })
                          })

                          if (!enrichResponse.ok) {
                            setNoteStatus(`Stopped at batch ${iteration}. ${processedCount} notes generated before error.`)
                            break
                          }

                          const enrichData = await enrichResponse.json()
                          const updatedInventory = ensureInventoryShape(enrichData.inventory || currentInventory)

                          const newRemaining = countItemsMissingFlavorNotes(updatedInventory)
                          const generatedThisBatch = Math.max(0, remainingMissing - newRemaining)

                          processedCount += generatedThisBatch
                          remainingMissing = newRemaining
                          currentInventory = updatedInventory
                          setInventory(currentInventory)

                          if (remainingMissing === 0) {
                            setNoteStatus(`Success: generated and saved ${processedCount} flavor notes!`)

                            await fetch(`${WORKER_URL}/inventory`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ inventory: currentInventory })
                            })

                            hapticFeedback('success')
                            break
                          }

                          await new Promise(resolve => setTimeout(resolve, 700))
                          iteration += 1
                        }

                        if (remainingMissing > 0) {
                          if (processedCount > 0) {
                            await fetch(`${WORKER_URL}/inventory`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ inventory: currentInventory })
                            })
                          }

                          setNoteStatus(`${remainingMissing} item(s) still missing notes. Please run again later.`)
                          hapticFeedback('medium')
                        }
                      } catch (error) {
                        console.error('Failed to generate flavor notes:', error)
                        setNoteStatus(`Failed after ${processedCount} notes. Please try again.`)
                        hapticFeedback('error')
                      } finally {
                        setGeneratingNotes(false)
                      }
                    }}
                    disabled={generatingNotes}
                    style={{
                      width: '100%',
                      background: generatingNotes ? 'transparent' : 'transparent',
                      color: generatingNotes ? '#a78bfa' : '#111',
                      border: 'none',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      cursor: generatingNotes ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => !generatingNotes && (e.target.style.background = '#f3f4f6')}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    <span>✨</span> {generatingNotes ? 'Generating...' : 'Generate Flavor Notes'}
                  </button>
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => {
                      hapticFeedback('light')
                      setMaintenanceMenuOpen(false)
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
                      fontSize: '14px',
                      minHeight: '40px',
                      fontWeight: '600'
                    }}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={openAddItemModal}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      + Add Item
                    </button>
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
                    <span style={{ fontSize: isMobile ? '13px' : '14px' }}>
                      <strong>
                        {item.brand ? `${item.brand} · ${item.name}` : item.name}
                      </strong>
                      {item.type && ` (${item.type})`}
                      {item.amount && ` - ${item.amount}`}
                      {item.size && ` - ${item.size}ml`}
                    </span>
                    <button
                      onClick={() => { hapticFeedback('light'); setShoppingList(shoppingList.filter((_, i) => i !== idx)); }}
                      style={{
                        padding: isMobile ? '12px 16px' : '8px 12px',
                        minHeight: '44px',
                        minWidth: '44px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: isMobile ? '13px' : '13px',
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
                            <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                              <label style={fieldLabelStyle}>Brand</label>
                              <input
                                type="text"
                                value={item.brand}
                                onChange={(e) => updateInventoryItem(idx, 'brand', e.target.value)}
                                placeholder="e.g. Absolut"
                                style={fieldInputStyle}
                              />
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
                          <div style={{ fontWeight: 600, fontSize: isMobile ? '14px' : '15px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            {item.brand ? (
                              <>
                                <span>{item.brand}</span>
                                <span style={{ opacity: 0.85 }}>{item.name || 'Unnamed Bottle'}</span>
                              </>
                            ) : (
                              item.name || 'Unnamed Bottle'
                            )}
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
                                <button onClick={() => { hapticFeedback('light'); quickAdjust(idx, 1); }} style={{ fontSize: isMobile ? '11px' : '12px', padding: isMobile ? '12px 10px' : '8px 12px', minHeight: '44px', minWidth: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  -1 oz
                                </button>
                                <button onClick={() => { hapticFeedback('light'); quickAdjust(idx, 1.5); }} style={{ fontSize: isMobile ? '11px' : '12px', padding: isMobile ? '12px 10px' : '8px 12px', minHeight: '44px', minWidth: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                  -Shot (1.5oz)
                                </button>
                                <button onClick={() => { hapticFeedback('light'); quickAdjust(idx, 2); }} style={{ fontSize: isMobile ? '11px' : '12px', padding: isMobile ? '12px 10px' : '8px 12px', minHeight: '44px', minWidth: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
                                    onClick={() => { hapticFeedback('light'); addToShoppingList(item); }}
                                    style={{
                                      fontSize: isMobile ? '12px' : '13px',
                                      padding: isMobile ? '12px 16px' : '8px 12px',
                                      minHeight: '44px',
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
                      {Object.entries(grouped).sort(([typeA], [typeB]) => typeA.localeCompare(typeB)).map(([type, items]) => {
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
                                  <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                                    <label style={fieldLabelStyle}>Brand</label>
                                    <input
                                      type="text"
                                      value={item.brand}
                                      onChange={(e) => updateInventoryItem(idx, 'brand', e.target.value)}
                                      placeholder="e.g. Absolut"
                                      style={fieldInputStyle}
                                    />
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
                                <div style={{ fontWeight: 600, fontSize: isMobile ? '14px' : '15px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                  {item.brand ? (
                                    <>
                                      <span>{item.brand}</span>
                                      <span style={{ opacity: 0.85 }}>{item.name || 'Unnamed Bottle'}</span>
                                    </>
                                  ) : (
                                    item.name || 'Unnamed Bottle'
                                  )}
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
                                      <button onClick={() => { hapticFeedback('light'); quickAdjust(idx, 1); }} style={{ fontSize: isMobile ? '11px' : '12px', padding: isMobile ? '12px 10px' : '8px 12px', minHeight: '44px', minWidth: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                        -1 oz
                                      </button>
                                      <button onClick={() => { hapticFeedback('light'); quickAdjust(idx, 1.5); }} style={{ fontSize: isMobile ? '11px' : '12px', padding: isMobile ? '12px 10px' : '8px 12px', minHeight: '44px', minWidth: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                        -Shot (1.5oz)
                                      </button>
                                      <button onClick={() => { hapticFeedback('light'); quickAdjust(idx, 2); }} style={{ fontSize: isMobile ? '11px' : '12px', padding: isMobile ? '12px 10px' : '8px 12px', minHeight: '44px', minWidth: '44px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
                                          onClick={() => { hapticFeedback('light'); addToShoppingList(item); }}
                                          style={{
                                            fontSize: isMobile ? '12px' : '13px',
                                            padding: isMobile ? '12px 16px' : '8px 12px',
                                            minHeight: '44px',
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
                    onClick={openAddItemModal}
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

      {/* #9: Floating Action Button (FAB) */}
      {isMobile && !fabMenuOpen && (
        <button
          onClick={() => {
            hapticFeedback('medium')
            setFabMenuOpen(true)
          }}
          style={{
            position: 'fixed',
            bottom: 'calc(96px + env(safe-area-inset-bottom))',
            right: '24px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease',
            transform: fabMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)'
          }}
        >
          +
        </button>
      )}

      {/* #9: FAB Quick Action Menu */}
      {isMobile && fabMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => {
              hapticFeedback('light')
              setFabMenuOpen(false)
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
              animation: 'fadeIn 0.2s ease'
            }}
          />

          {/* Action buttons */}
          <div style={{
            position: 'fixed',
            bottom: 'calc(96px + env(safe-area-inset-bottom))',
            right: '24px',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'flex-end'
          }}>
            <button
              onClick={() => {
                hapticFeedback('light')
                setFabMenuOpen(false)
                openAddItemModal()
              }}
              style={{
                padding: '12px 20px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                minHeight: '44px',
                whiteSpace: 'nowrap',
                animation: 'slideUp 0.2s ease'
              }}
            >
              📦 Add Inventory
            </button>
            <button
              onClick={() => {
                hapticFeedback('light')
                setFabMenuOpen(false)
                setCurrentView('chat')
                setInput('What cocktail can I make?')
              }}
              style={{
                padding: '12px 20px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                minHeight: '44px',
                whiteSpace: 'nowrap',
                animation: 'slideUp 0.25s ease'
              }}
            >
              🍹 Ask for Cocktail
            </button>
            <button
              onClick={() => {
                hapticFeedback('medium')
                setFabMenuOpen(false)
              }}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'rotate(45deg)',
                animation: 'slideUp 0.3s ease'
              }}
            >
              +
            </button>
          </div>
        </>
      )}

      {/* Menu Editor View */}
      {currentView === 'menu' && (
        <MenuEditor
          inventory={inventory}
          customRecipes={customRecipes}
          onClose={() => setCurrentView('chat')}
        />
      )}

      {/* Add Inventory Modal */}
      <AddInventoryModal
        isOpen={addItemModalOpen}
        onClose={closeAddItemModal}
        item={modalItem}
        onUpdateItem={updateModalItem}
        onSaveAndAddAnother={saveAndAddAnother}
        onSaveAndClose={saveAndClose}
        bottleUnit={modalBottleUnit}
        remainingUnit={modalRemainingUnit}
        onBottleUnitChange={setModalBottleUnit}
        onRemainingUnitChange={setModalRemainingUnit}
        isMobile={isMobile}
        isGenerating={generatingNotes}
      />
    </div>
  )
}

export default App
