# 🍹 AI Bartender - Home Bar Assistant

An AI-powered bartender that helps you create drinks, manage your bar inventory, and suggest recipes based on what you have on hand. Built with React, Cloudflare Workers, and Google Gemini AI.

## ✨ Features

- 💬 **Unified Chat + Inventory Assistant** ? Gemini-powered bartender persona that remembers your conversations, inspects the live inventory, suggests swaps, scales batches, and subtracts ingredients when you make a drink.
- 📈 **Rich Inventory Manager** ? Structured bottles with type/proof/size/amount, progress bars, quick ?oz adjustments, grouping & fuzzy search, CSV export, and low-stock shopping lists.
- 🌟 **Custom Recipes & Favorites** ? Full recipe builder with inventory-aware ingredient matching (including flavored spirits), tagging, editing, and a Favorites tab for house signatures.
- 🍹 **Automated Flavor Notes** ? Gemini enriches new bottles with tasting notes so entries stay descriptive with almost no manual copywriting.
- 📜 **Menu Publishing** ? Public `menu.html` plus markdown/PDF assets so guests can browse your signature list without authenticating.
- 🔒 **Polished & Secure Stack** ? Purple Moonz branding, swipe-friendly layout, cocktail favicon, Cloudflare Pages + Workers + KV behind Cloudflare Access, all inside the free tiers of Cloudflare and Google Gemini.

## 🎯 Demo

[Add your deployed URL here]

## 🚀 Quick Start

### Prerequisites

1. **Cloudflare Account** (free) - [Sign up here](https://dash.cloudflare.com/sign-up)
2. **Google Gemini API Key** (free) - [Get it here](https://ai.google.dev/)
3. **GitHub Account** (free) - [Sign up here](https://github.com/join)
4. **Node.js 18+** (for local development) - [Download here](https://nodejs.org/)

### Step 1: Get Your Google Gemini API Key

1. Go to [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key"
3. Create a new API key
4. Copy it (you'll need it later)

### Step 2: Fork or Clone This Repository

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-bartender.git
cd ai-bartender

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
   
   Copy the ID that's printed and update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "BARTENDER_KV"
   id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace with your ID
   ```

4. **Set Your Gemini API Key:**
   ```bash
   wrangler secret put GEMINI_API_KEY
   ```
   Paste your Gemini API key when prompted

5. **Deploy the Worker:**
   ```bash
   wrangler deploy
   ```
   
   Note the worker URL (e.g., `bartender-api.YOUR_SUBDOMAIN.workers.dev`)

### Step 4: Update Frontend Configuration

Edit `src/App.jsx` and update the `WORKER_URL`:

```javascript
const WORKER_URL = 'https://bartender-api.YOUR_SUBDOMAIN.workers.dev/api'
```

### Step 5: Deploy to Cloudflare Pages

**Option A: Via GitHub (Recommended)**

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Go to [Cloudflare Pages](https://dash.cloudflare.com/pages)
3. Click "Create a project" → "Connect to Git"
4. Select your repository
5. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
6. Click "Save and Deploy"
7. Once deployed, set up your custom domain (bartender.tawiah.net)

**Option B: Via Wrangler CLI**

```bash
npm run build
wrangler pages deploy dist --project-name=ai-bartender
```

### Step 6: Configure Custom Domain

1. Go to your Pages project in Cloudflare Dashboard
2. Click "Custom domains"
3. Add `bartender.tawiah.net`
4. Cloudflare will automatically configure DNS

## 📱 Usage

### Adding Inventory

1. Click the "Inventory" button
2. Click "Edit"
3. Add your bottles, mixers, and ingredients
4. Save

### Asking for Drinks

- "Make me a margarita"
- "What can I make with vodka?"
- "I need a drink for 4 people"
- "Suggest something tropical"

### Tracking Usage

Tell the bartender when you make a drink:
- "I just made 2 margaritas"
- The AI will help you track what was used

### Updating Inventory Manually

Go to Inventory → Edit → Update quantities → Save

## 🔧 Configuration

### Customizing the AI Prompt

Edit `worker/worker.js` and modify the `systemPrompt` variable to change how the bartender behaves.

### Changing AI Model

The default is `gemini-pro`. You can use `gemini-1.5-pro` or other models by changing the endpoint in `worker/worker.js`.

### Free Tier Limits

- **Gemini API:** 60 requests/minute, 1500 requests/day
- **Cloudflare Workers:** 100,000 requests/day
- **Cloudflare KV:** 100,000 reads/day, 1,000 writes/day
- **Cloudflare Pages:** Unlimited

These limits are more than enough for personal/home use!

## 🛠️ Local Development

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. In another terminal, start the worker locally:
   ```bash
   wrangler dev worker/worker.js
   ```

3. Update `WORKER_URL` in `src/App.jsx` to `http://localhost:8787/api`

4. Open http://localhost:5173

## 🔐 Security Notes

- ✅ API keys are stored as Cloudflare secrets (not in code)
- ✅ Worker acts as proxy to hide API key from frontend
- ✅ robots.txt prevents search engine indexing
- ✅ Inventory data is private to your KV namespace
- ⚠️ No authentication - anyone with the URL can access it
  - For added security, consider adding Cloudflare Access (free for up to 50 users)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - feel free to use this for your own home bar!

## 🙏 Acknowledgments

- Built with [React](https://react.dev/)
- Powered by [Google Gemini](https://ai.google.dev/)
- Deployed on [Cloudflare](https://cloudflare.com/)

## 📞 Support

If you run into issues:
1. Check the [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
2. Check the [Gemini API docs](https://ai.google.dev/docs)
3. Open an issue on GitHub

## 🍸 Enjoy Responsibly!

This is a tool to help you make drinks at home. Please drink responsibly and never drink and drive.

---

Made with ❤️ for home bartenders everywhere
