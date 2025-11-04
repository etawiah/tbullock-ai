import { useState, useEffect, useRef } from 'react'

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [inventory, setInventory] = useState([])
  const [showInventory, setShowInventory] = useState(false)
  const [editingInventory, setEditingInventory] = useState(false)
  const messagesEndRef = useRef(null)
  
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
      setInventory(data.inventory || [])
    } catch (error) {
      console.error('Failed to load inventory:', error)
    }
  }

  const saveInventory = async (newInventory) => {
    try {
      const response = await fetch(`${WORKER_URL}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: newInventory })
      })
      if (response.ok) {
        setInventory(newInventory)
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
    const newItem = { name: '', quantity: '', unit: 'oz' }
    setInventory([...inventory, newItem])
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
          <h1 style={{ margin: 0, fontSize: '24px' }}>🍹 AI Bartender</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
            Your personal mixologist
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
                {inventory.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                      padding: '12px',
                      background: '#f9fafb',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    {editingInventory ? (
                      <>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateInventoryItem(idx, 'name', e.target.value)}
                          placeholder="Item name"
                          style={{
                            flex: 2,
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '14px'
                          }}
                        />
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateInventoryItem(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '14px'
                          }}
                        />
                        <select
                          value={item.unit}
                          onChange={(e) => updateInventoryItem(idx, 'unit', e.target.value)}
                          style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '14px'
                          }}
                        >
                          <option value="oz">oz</option>
                          <option value="ml">ml</option>
                          <option value="bottle">bottle</option>
                          <option value="cup">cup</option>
                          <option value="tsp">tsp</option>
                          <option value="tbsp">tbsp</option>
                        </select>
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
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 2, fontSize: '14px' }}>{item.name}</span>
                        <span style={{ flex: 1, fontSize: '14px', color: '#666' }}>
                          {item.quantity} {item.unit}
                        </span>
                      </>
                    )}
                  </div>
                ))}
                
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
