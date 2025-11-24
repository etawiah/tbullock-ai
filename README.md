# 🍹 Tom Bullock - AI Personal Mixologist

An AI-powered home bartender assistant that helps you manage your bar inventory, create custom cocktails, and get personalized drink recommendations. Built with React, Cloudflare Workers, and powered by Google Gemini AI with Groq fallback.

**Live Demo:** [https://236626d7.ai-bartender.pages.dev](https://236626d7.ai-bartender.pages.dev)

## ✨ Features

### 🤖 AI-Powered Bartender Assistant
- **Smart Conversation**: Chat with Tom Bullock, an AI bartender trained on classic cocktail knowledge
- **Inventory-Aware**: AI has live access to your bar inventory and suggests drinks you can actually make
- **Intelligent Matching**: Recognizes generic ingredients (whiskey, red wine, vodka) and offers bottle selection when you have multiple options
- **Recipe Scaling**: Automatically scales recipes for multiple servings
- **Ingredient Substitutions**: Suggests swaps when you're missing ingredients

### 📦 Advanced Inventory Management
- **Structured Tracking**: Track bottle type, brand, name, proof, size, and remaining amount
- **Smart Ingredient Matching**:
  - Exact matching for specific spirits (Prosecco, Champagne)
  - Category matching for wines (Red Wine matches Merlot, Cabernet, etc.)
  - Generic spirit matching (Whiskey matches Bourbon, Rye, Scotch, etc.)
- **Visual Progress Bars**: Color-coded fill levels (green/yellow/red)
- **Quick Adjustments**: Fast buttons to subtract 1oz, 1.5oz, or 2oz from bottles
- **Flexible Units**: Switch between ml, L, and oz for any field
- **Smart Search**: Fuzzy search across brand, name, type, and flavor notes
- **Type Grouping**: Collapsible categories (Vodka, Gin, Rum, etc.)
- **Stock Alerts**: Low stock indicators and shopping list integration
- **CSV/JSON Export**: Backup and share your inventory

### 🍸 Custom Recipe Builder
- **Full Recipe Editor**: Name, ingredients, instructions, glassware, garnish, tags
- **Ingredient Autocomplete**: Suggests ingredients from your current inventory
- **Generic Ingredients**: Create recipes with "Whiskey" or "Red Wine" to work with any bottle you have
- **Bottle Selection Dialog**: Choose which specific bottle to use when making drinks
- **Availability Detection**: Instantly see which ingredients you're missing
- **Recipe Cards**: Beautiful cards showing matched bottles and remaining amounts
- **Favorites Tab**: Dedicated view for your custom cocktails

### 🧠 AI Flavor Notes
- **Automated Enrichment**: Gemini AI generates tasting notes for new bottles
- **Batch Generation**: Process multiple bottles at once
- **Fallback Support**: Groq API automatically handles overflow when Gemini hits rate limits
- **Smart Skipping**: Skips tools, garnishes, and other non-flavor items

### 📱 Mobile-First PWA
- **Progressive Web App**: Install on iPhone/Android home screen
- **Swipe Navigation**: Swipe between Chat, Inventory, and Favorites
- **Touch-Optimized**: 44px+ touch targets, haptic feedback
- **Responsive Design**: Vertical-stacking forms, no horizontal scroll
- **Safe Areas**: Proper iPhone notch handling
- **Purple Moon Icon**: Beautiful starry-night theme icon
- **Fixed Chat Input**: Always-accessible message box on mobile

### 📋 Shopping List
- **Auto-Sync**: Syncs across all your devices via Cloudflare KV
- **Add from Chat**: AI can add missing ingredients to your list
- **Manual Management**: Add/remove items directly

### 🎨 Polished UI/UX
- **Maintenance Dropdown**: Clean interface with hidden utility buttons
- **Modal Overlays**: Smooth dialogs for adding items and selecting bottles
- **Purple Gradient Theme**: Professional dark purple gradient (#667eea to #764ba2)
- **Loading States**: Clear feedback for AI generation and API calls
- **Confirmation Messages**: Detailed feedback showing which bottles were used

## 🎯 Use Cases

- **Home Bartenders**: Track your collection and get AI suggestions
- **Cocktail Enthusiasts**: Build your custom recipe library
- **Party Planning**: Scale recipes for guests and check availability
- **Inventory Management**: Never run out of your favorite spirits
- **Learning**: Discover new drinks based on what you have

## 🚀 Quick Start

### Prerequisites

1. **Cloudflare Account** (free) - [Sign up](https://dash.cloudflare.com/sign-up)
2. **Google Gemini API Key** (free) - [Get key](https://ai.google.dev/)
3. **Groq API Key** (optional, free) - [Get key](https://console.groq.com/) - For fallback when Gemini is rate-limited
4. **Node.js 18+** - [Download](https://nodejs.org/)

### Step 1: Get Your API Keys

#### Google Gemini (Required)
1. Go to [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key"
3. Create a new API key
4. Copy it (you'll use it in Step 3)

#### Groq (Optional but Recommended)
1. Go to [Groq Console](https://console.groq.com/)
2. Sign up for a free account
3. Create an API key
4. Copy it (you'll use it in Step 3)

### Step 2: Clone and Install

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/tbullock-ai.git
cd tbullock-ai

# Install dependencies
npm install
```

### Step 3: Set Up Cloudflare Worker

1. **Install Wrangler CLI:**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Create a KV Namespace:**
   ```bash
   wrangler kv:namespace create "BARTENDER_KV"
   ```

   Copy the ID and update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "BARTENDER_KV"
   id = "YOUR_KV_NAMESPACE_ID_HERE"
   ```

4. **Set Your API Keys as Secrets:**
   ```bash
   # Required: Gemini API key
   wrangler secret put GEMINI_API_KEY

   # Optional but recommended: Groq API key for fallback
   wrangler secret put GROQ_API_KEY
   ```
   Paste each API key when prompted.

5. **Deploy the Worker:**
   ```bash
   cd worker
   wrangler deploy
   ```

   Note the worker URL (e.g., `https://bartender-api.YOUR_SUBDOMAIN.workers.dev`)

### Step 4: Configure Frontend

Edit `src/App.jsx` and update the `WORKER_URL`:

```javascript
const WORKER_URL = 'https://bartender-api.YOUR_SUBDOMAIN.workers.dev/api'
```

### Step 5: Deploy Frontend

**Option A: GitHub + Cloudflare Pages (Recommended)**

1. Push to GitHub:
   ```bash
   git add .
   git commit -m "Initial deployment"
   git push origin main
   ```

2. Create Cloudflare Pages project:
   - Go to [Cloudflare Pages](https://dash.cloudflare.com/pages)
   - Click "Create a project" → "Connect to Git"
   - Select your repository
   - Build settings:
     - **Build command:** `npm run build`
     - **Build output directory:** `dist`
   - Deploy

**Option B: Wrangler CLI**

```bash
npm run build
wrangler pages deploy dist --project-name=ai-bartender
```

### Step 6: Generate PWA Icons (Optional)

The app includes a purple moon icon. To regenerate PNGs from the SVG:

```bash
node scripts/generate-icons.js
```

This creates `public/icon-192.png` and `public/icon-512.png` from `public/favicon.svg`.

## 📱 Mobile Setup

### iPhone (Safari)
1. Open the app in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. The purple moon icon will appear on your home screen
5. Open the app - it runs in standalone mode (no browser UI)

### Android (Chrome)
1. Open the app in Chrome
2. Tap the menu (⋮)
3. Tap "Install app" or "Add to Home Screen"
4. The app installs as a PWA

### Mobile Features
- Swipe left/right to switch between Chat, Inventory, and Favorites
- Fixed chat input at bottom of screen
- Pull-to-refresh in Inventory view
- Haptic feedback on button presses
- Respects iPhone notch and safe areas

## 🎓 How to Use

### Adding Inventory

**Method 1: Via Chat**
- "Add a bottle of Absolut Vodka 750ml"
- The AI will extract details and add it to inventory

**Method 2: Inventory Tab**
1. Navigate to Inventory
2. Tap "Add Item" button
3. Fill in details (Type, Brand, Name, Proof, Size, Amount)
4. Tap "Generate Flavor Notes" for AI descriptions
5. Save

### Creating Custom Recipes

1. Go to **Favorites** tab
2. Tap **"Create New Recipe"**
3. Enter recipe details:
   - Name: "My Old Fashioned"
   - Ingredients: Type "Whiskey" (or select from autocomplete)
   - Amount: 2, Unit: oz
   - Add more ingredients with "+ Add Ingredient"
4. Add instructions, glassware, garnish, tags
5. Save

**Using Generic Ingredients:**
- **Base Spirits**: Vodka, Rum, Gin, Whiskey, Tequila, Bourbon, Brandy, Cognac, Scotch, Rye, Mezcal
- **Wine Categories**: Red Wine, White Wine, Rosé
- When you make a drink with a generic ingredient and have multiple matching bottles, you'll get a selection dialog

### Making Drinks

**Method 1: Recipe Cards**
1. Go to Favorites tab
2. Tap "Make This Drink" on a recipe
3. If you have multiple matching bottles, select which to use
4. Confirm - inventory automatically updates

**Method 2: Chat Request**
- "Make me a Margarita"
- "What can I make with bourbon?"
- "I need a drink for 4 people"

### Tracking Usage

Tell the AI when you make drinks manually:
- "I just made 2 margaritas"
- "Used 2oz of gin and 1oz of vermouth"

The AI will subtract the amounts from your inventory.

### Shopping List

- Chat: "Add tonic water to my shopping list"
- Inventory: Tap item → "Add to Shopping"
- Recipe: Missing ingredients show "Add to Shopping" buttons

The shopping list syncs across all your devices automatically.

## 🔧 Configuration

### Customizing AI Behavior

Edit `worker/worker.js` and modify the `systemPrompt` to change how Tom Bullock responds.

### API Models

The app currently uses:
- **Gemini**: `gemini-1.5-flash-latest` (fast, free tier: 60 req/min, 1500 req/day)
- **Groq**: Automatically used when Gemini is rate-limited

To change models, edit the API endpoints in `worker/worker.js`.

### Free Tier Limits

| Service | Free Tier Limit | Notes |
|---------|----------------|-------|
| **Gemini API** | 60 req/min, 1500 req/day | Primary AI provider |
| **Groq API** | 30 req/min, 14,400 req/day | Fallback provider |
| **Cloudflare Workers** | 100,000 req/day | API backend |
| **Cloudflare KV** | 100,000 reads/day, 1,000 writes/day | Data storage |
| **Cloudflare Pages** | Unlimited | Frontend hosting |

These limits are more than sufficient for personal use!

### Fallback Behavior

When Gemini reaches rate limits:
1. Worker automatically tries Groq
2. If both fail, user gets clear error message
3. Enhanced logging shows which provider was used

## 🛠️ Local Development

1. **Start the frontend dev server:**
   ```bash
   npm run dev
   ```

2. **In another terminal, start the worker:**
   ```bash
   npm run worker:dev
   ```

3. **Update the worker URL in `src/App.jsx`:**
   ```javascript
   const WORKER_URL = 'http://localhost:8787/api'
   ```

4. **Open:** http://localhost:5173

### Development Scripts

```bash
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run worker:dev       # Start worker locally
npm run worker:deploy    # Deploy worker to Cloudflare
npm run deploy           # Build and deploy everything
```

## 🏗️ Architecture

### Frontend (React + Vite)
- **Single-page application** with three views: Chat, Inventory, Favorites
- **State management**: React hooks (useState, useEffect, useRef)
- **Responsive design**: Mobile-first with conditional rendering
- **PWA**: Service worker, manifest.json, offline-ready
- **Touch gestures**: Swipe navigation, pull-to-refresh

### Backend (Cloudflare Worker)
- **Serverless API** handling all business logic
- **KV Storage** for inventory, recipes, shopping list, chat history
- **AI Integration**: Dual-provider fallback (Gemini → Groq)
- **Endpoints**:
  - `/api/chat` - Conversational AI with inventory context
  - `/api/inventory` - CRUD operations for bottles
  - `/api/recipes` - Custom recipe management
  - `/api/shopping` - Shopping list sync
  - `/api/flavor-notes` - Batch AI generation

### Data Flow
```
User Input → React Component
            ↓
Frontend API Call (fetch)
            ↓
Cloudflare Worker (worker.js)
            ↓
    ┌───────┴───────┐
    ↓               ↓
Gemini API      Cloudflare KV
(or Groq)       (Storage)
    ↓               ↓
    └───────┬───────┘
            ↓
JSON Response
            ↓
React State Update
            ↓
UI Re-render
```

### Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main React component (3600+ lines) |
| `worker/worker.js` | Cloudflare Worker API |
| `public/favicon.svg` | Purple moon icon source |
| `public/manifest.json` | PWA configuration |
| `scripts/generate-icons.js` | PNG icon generation from SVG |
| `wrangler.toml` | Worker deployment config |
| `package.json` | Dependencies and scripts |

## 🔐 Security & Privacy

### ✅ Security Features
- API keys stored as Cloudflare secrets (never in code)
- Worker acts as proxy to hide keys from frontend
- `robots.txt` prevents search engine indexing
- Data isolated to your KV namespace

### ⚠️ No Built-in Authentication
The default deployment has no authentication - anyone with the URL can access it.

**For added security:**
1. **Cloudflare Access** (free for up to 50 users):
   - Add email-based authentication
   - Google/GitHub OAuth login
   - [Setup guide](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/)

2. **Custom domain with password**:
   - Use Cloudflare Workers auth middleware
   - Implement simple password protection

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional AI providers (OpenAI, Anthropic)
- Voice input for mobile
- Recipe sharing (QR codes, export)
- Cocktail photos and garnish library
- Barcode scanning for adding bottles
- Analytics dashboard

Please open an issue or PR on GitHub.

## 📝 License

MIT License - Free to use for personal or commercial projects.

## 🙏 Acknowledgments

### Powered By
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless backend
- [Cloudflare Pages](https://pages.cloudflare.com/) - Frontend hosting
- [Google Gemini](https://ai.google.dev/) - Primary AI provider
- [Groq](https://groq.com/) - Fallback AI provider

### Inspired By
**Tom Bullock (1872–1964)** - The first African American to publish a cocktail book, *"The Ideal Bartender"* (1917). His work preserved pre-Prohibition cocktail culture and pioneered professional bartending.

## 📞 Support & Documentation

### Issues
- Check [MOBILE_UX_ANALYSIS.md](./MOBILE_UX_ANALYSIS.md) for mobile-specific details
- Check [CHANGELOG.md](./CHANGELOG.md) for recent updates
- Open an issue on GitHub for bugs or feature requests

### Resources
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Groq API Docs](https://console.groq.com/docs)
- [PWA Documentation](https://web.dev/progressive-web-apps/)

## 🍸 Drink Responsibly

This tool helps you create and track cocktails at home. Please drink responsibly, never drink and drive, and know your limits.

---

**Built with ❤️ for home bartenders everywhere**

*Current Version: 1.0.0*
*Last Updated: January 2025*
