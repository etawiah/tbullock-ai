import { useState, useEffect, useRef } from 'react'

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

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [inventory, setInventory] = useState([])
  const [showInventory, setShowInventory] = useState(false)
  const [editingInventory, setEditingInventory] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedTypes, setCollapsedTypes] = useState({})
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

  // Load inventory on mount
  useEffect(() => {
    loadInventory()
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
    try {
      const normalizedInventory = ensureInventoryShape(newInventory)

      // First, enrich items with missing flavor notes
      const enrichResponse = await fetch(`${WORKER_URL}/enrich-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: normalizedInventory })
      })

      let enrichedInventory = normalizedInventory
      if (enrichResponse.ok) {
        const enrichData = await enrichResponse.json()
        enrichedInventory = enrichData.inventory || normalizedInventory
      }

      // Then save the enriched inventory
      const response = await fetch(`${WORKER_URL}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: enrichedInventory })
      })
      if (response.ok) {
        setInventory(enrichedInventory)
        setEditingInventory(false)
      }
    } catch (error) {
      console.error('Failed to save inventory:', error)
      alert('Failed to save inventory')
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
    setInventory([...inventory, newItem])
    // Clear search query so new item is visible
    setSearchQuery('')
    // Expand the section where new item is added (Vodka by default)
    setCollapsedTypes(prev => ({ ...prev, [newItem.type]: false }))
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

  // Group inventory by type and apply search filter
  const getGroupedInventory = () => {
    const filtered = inventory.filter(item => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        item.name.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        (item.flavorNotes && item.flavorNotes.toLowerCase().includes(query))
      )
    })

    const grouped = {}
    filtered.forEach((item, index) => {
      const type = item.type || 'Other'
      if (!grouped[type]) grouped[type] = []
      grouped[type].push({ ...item, originalIndex: inventory.indexOf(item) })
    })

    return grouped
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
      {/* Header */}
      <div style={{ 
        padding: '16px', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>🍹 Tom Bullock</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
            Home AI personal mixologist
          </p>
        </div>
        <button
          onClick={() => setShowInventory(!showInventory)}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {showInventory ? 'Chat' : 'Inventory'} ({inventory.length})
        </button>
      </div>

      {/* Main Content */}
      {!showInventory ? (
        <>
          {/* Chat Messages */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '16px',
            background: '#f5f5f5'
          }}>
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
                  <span style={{ color: '#667eea' }}>🍸 Mixing up a response...</span>
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
      ) : (
        // Inventory View
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '16px',
          background: '#f5f5f5'
        }}>
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
                <button
                  onClick={() => setEditingInventory(true)}
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
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => saveInventory(inventory)}
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
                    Save
                  </button>
                  <button
                    onClick={() => {
                      loadInventory()
                      setEditingInventory(false)
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
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

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
                {/* Grouped by Type */}
                {Object.entries(getGroupedInventory()).map(([type, items]) => {
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
                              <input
                                type="number"
                                min="0"
                                value={item.bottleSizeMl}
                                onChange={(e) => updateInventoryItem(idx, 'bottleSizeMl', e.target.value)}
                                placeholder="e.g. 750"
                                style={fieldInputStyle}
                              />
                            </div>
                            <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
                              <label style={fieldLabelStyle}>Amount Remaining (ml)</label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.amountRemaining}
                                onChange={(e) => updateInventoryItem(idx, 'amountRemaining', e.target.value)}
                                placeholder="e.g. 300"
                                style={fieldInputStyle}
                              />
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
                          <div style={{ fontWeight: 600, fontSize: '15px' }}>
                            {item.name || 'Unnamed Bottle'}
                          </div>
                          <div style={{ fontSize: '13px', color: '#4b5563' }}>
                            {item.type || 'Type not set'}
                          </div>
                          <div style={{ fontSize: '13px', color: '#4b5563' }}>
                            {item.proof ? `Proof: ${item.proof}` : 'Proof not set'}
                          </div>
                          <div style={{ fontSize: '13px', color: '#4b5563' }}>
                            {item.bottleSizeMl ? `Bottle size: ${item.bottleSizeMl} ml` : 'Bottle size not set'}
                          </div>
                          <div style={{ fontSize: '13px', color: '#4b5563' }}>
                            {item.amountRemaining
                              ? `Remaining: ${item.amountRemaining} ml`
                              : 'Amount remaining not set'}
                          </div>
                          {item.flavorNotes && (
                            <div style={{ fontSize: '13px', color: '#374151' }}>
                              Notes: {item.flavorNotes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                      </div>
                    )
                  })}

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
    </div>
  )
}

export default App
