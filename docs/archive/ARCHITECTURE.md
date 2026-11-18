# 🏗️ Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     bartender.tawiah.net                        │
│                    (Your Custom Domain)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ DNS Points To
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                             │
│                    (Static Site Hosting)                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              React Frontend                          │     │
│  │  • Chat Interface                                    │     │
│  │  • Inventory Management UI                           │     │
│  │  • Mobile-Responsive Design                          │     │
│  └───────────────────┬──────────────────────────────────┘     │
│                      │                                         │
└──────────────────────┼─────────────────────────────────────────┘
                       │
                       │ API Calls to
                       │ /api/chat
                       │ /api/inventory
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (API Layer)                      │
│         bartender-api.YOUR_NAME.workers.dev                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐     │
│  │           API Router & Logic                         │     │
│  │  • Route: GET /api/inventory                         │     │
│  │  • Route: POST /api/inventory                        │     │
│  │  • Route: POST /api/chat                             │     │
│  │  • CORS handling                                     │     │
│  │  • Error handling                                    │     │
│  └───────┬─────────────────────────┬────────────────────┘     │
│          │                         │                           │
└──────────┼─────────────────────────┼───────────────────────────┘
           │                         │
           │ Store/Retrieve          │ Generate
           │ Inventory               │ Responses
           ▼                         ▼
┌──────────────────────┐  ┌────────────────────────────┐
│   Cloudflare KV      │  │   Google Gemini AI         │
│   (Data Storage)     │  │   (Language Model)         │
│                      │  │                            │
│  • Inventory JSON    │  │  • gemini-pro model        │
│  • Persistent        │  │  • Drink suggestions       │
│  • Fast access       │  │  • Recipe generation       │
│  • Free tier         │  │  • Conversation context    │
└──────────────────────┘  └────────────────────────────┘
```

## Data Flow

### 1. User Requests Inventory
```
User Browser → Cloudflare Pages (React App)
                     ↓
              GET /api/inventory
                     ↓
              Cloudflare Worker
                     ↓
              KV Storage (read)
                     ↓
              JSON data returned
                     ↓
              Display in UI
```

### 2. User Saves Inventory
```
User Browser → Cloudflare Pages (React App)
                     ↓
              POST /api/inventory
              (with inventory JSON)
                     ↓
              Cloudflare Worker
                     ↓
              KV Storage (write)
                     ↓
              Success response
                     ↓
              UI updated
```

### 3. User Chats with Bartender
```
User Browser → Cloudflare Pages (React App)
                     ↓
              POST /api/chat
              (message + inventory + history)
                     ↓
              Cloudflare Worker
                     ↓
       ┌──────────────┴──────────────┐
       ▼                              ▼
Build prompt with:              Send to Gemini API
• Current inventory             with full context
• Chat history                        ↓
• System instructions            AI generates response
       │                              │
       └──────────────┬───────────────┘
                      ▼
              Format response
                      ↓
              Return to frontend
                      ↓
              Display in chat
```

## Component Breakdown

### Frontend (React - Cloudflare Pages)
```
src/
├── App.jsx
│   ├── Chat Interface
│   │   ├── Message Display
│   │   ├── Input Field
│   │   └── Send Button
│   │
│   └── Inventory Manager
│       ├── Item List
│       ├── Add/Edit/Delete
│       └── Save/Cancel
│
└── main.jsx (Entry point)
```

### Backend (Cloudflare Worker)
```
worker/worker.js
├── CORS Handler
├── Route: GET /api/inventory
│   └── Read from KV
├── Route: POST /api/inventory
│   └── Write to KV
└── Route: POST /api/chat
    ├── Build system prompt
    ├── Include inventory context
    ├── Call Gemini API
    └── Return AI response
```

### Storage (Cloudflare KV)
```
Key-Value Store
├── Key: "inventory"
└── Value: JSON array
    [
      { name: "Vodka", quantity: "750", unit: "ml" },
      { name: "Gin", quantity: "500", unit: "ml" },
      ...
    ]
```

## Security Architecture

```
┌─────────────────────────────────────────────────┐
│              Security Layers                    │
└─────────────────────────────────────────────────┘

1. API Key Protection
   ┌──────────────────────────────────┐
   │ Gemini API Key stored as         │
   │ Cloudflare Worker Secret         │
   │ (Never exposed to browser)       │
   └──────────────────────────────────┘

2. Domain Privacy
   ┌──────────────────────────────────┐
   │ robots.txt blocks crawlers       │
   │ No public listing                │
   │ Only URL holders can access      │
   └──────────────────────────────────┘

3. Data Privacy
   ┌──────────────────────────────────┐
   │ Inventory in private KV          │
   │ No external data sharing         │
   │ No analytics/tracking            │
   └──────────────────────────────────┘

4. CORS Protection
   ┌──────────────────────────────────┐
   │ Worker validates origins         │
   │ Prevents unauthorized access     │
   └──────────────────────────────────┘
```

## Deployment Architecture

```
Development                Production
────────────               ──────────

Your Computer              GitHub Repository
     │                            │
     │ git push                   │
     ▼                            ▼
GitHub Repo  ────────────→  Cloudflare Pages
                                  │
                                  │ Auto-build
                                  │ on git push
                                  ▼
                            bartender.tawiah.net
                            
                            
Your Computer              Cloudflare
     │                          │
     │ wrangler deploy          │
     ▼                          ▼
Cloudflare Worker ────────→ Live API
bartender-api.workers.dev
```

## Technology Stack

```
┌─────────────────────────────────────────────────┐
│                 Tech Stack                      │
├─────────────────────────────────────────────────┤
│ Frontend                                        │
│  • React 18                                     │
│  • Vite (build tool)                            │
│  • Vanilla CSS (inline styles)                 │
├─────────────────────────────────────────────────┤
│ Backend                                         │
│  • Cloudflare Workers (Edge compute)            │
│  • JavaScript (ES6+)                            │
├─────────────────────────────────────────────────┤
│ Storage                                         │
│  • Cloudflare KV (Key-Value store)              │
├─────────────────────────────────────────────────┤
│ AI                                              │
│  • Google Gemini Pro (LLM)                      │
│  • REST API integration                         │
├─────────────────────────────────────────────────┤
│ Hosting                                         │
│  • Cloudflare Pages (Frontend)                  │
│  • Cloudflare Workers (Backend)                 │
│  • Custom domain (bartender.tawiah.net)         │
├─────────────────────────────────────────────────┤
│ Development                                     │
│  • Node.js 18+                                  │
│  • Wrangler CLI                                 │
│  • Git/GitHub                                   │
└─────────────────────────────────────────────────┘
```

## Network Flow

```
1. Initial Page Load
   Browser → Cloudflare CDN → Static HTML/JS/CSS
   (< 1 second, cached globally)

2. Load Inventory
   Browser → Worker → KV Read → Response
   (< 100ms, edge computing)

3. Chat Request
   Browser → Worker → Gemini API → Response
   (1-3 seconds, depends on AI processing)

4. Save Inventory
   Browser → Worker → KV Write → Confirmation
   (< 50ms, edge computing)
```

## Scalability

```
Current Setup (Home Use)
├── Users: 1-5 people
├── Requests: ~10-50 per day
├── Storage: < 1 KB
└── Cost: $0

Can Scale To:
├── Users: Thousands
├── Requests: 100k per day (free tier)
├── Storage: 1 GB (free tier)
└── Cost: Still $0
```

## Why This Architecture?

### Edge Computing (Cloudflare Workers)
✅ Fast response times (runs near users)
✅ No server management
✅ Auto-scaling
✅ 100% uptime

### Serverless
✅ Pay only for usage (in your case: $0)
✅ No idle server costs
✅ Automatic scaling

### JAMstack (JavaScript, APIs, Markup)
✅ Static frontend (fast, secure)
✅ API backend (flexible, scalable)
✅ Decoupled architecture (easy to update)

### Modern Best Practices
✅ Environment variables for secrets
✅ Git-based deployment
✅ CI/CD ready
✅ Mobile-first design

---

This architecture ensures your bartender is:
• Fast ⚡
• Reliable 💪
• Secure 🔒
• Free 💰
• Scalable 📈
