# Getting Started - Quick Setup

## ✅ Project is Ready!

All configuration files have been created. Here's how to deploy your AI Bartender:

## 📋 What You Need

1. **Gemini API Key** - You mentioned you have this already ✓
2. **GitHub Account** - You have the public repo "tbullock-ai" ✓
3. **Cloudflare Account** (free) - Sign up at https://dash.cloudflare.com/sign-up

## 🚀 Deployment Steps

### Step 1: Install Dependencies (2 min)

```bash
# Install Node.js dependencies
npm install

# Install Wrangler CLI globally
npm install -g wrangler
```

### Step 2: Set Up Cloudflare Worker (5 min)

```bash
# Login to Cloudflare
wrangler login

# Create KV namespace for inventory storage
wrangler kv:namespace create "BARTENDER_KV"
```

This will output something like:
```
{ binding = "BARTENDER_KV", id = "abc123xyz456" }
```

**IMPORTANT:** Copy the `id` value and update line 11 in `wrangler.toml`:
```toml
id = "abc123xyz456"  # Replace with your actual ID
```

### Step 3: Add Your Gemini API Key (1 min)

```bash
wrangler secret put GEMINI_API_KEY
```

When prompted, paste your Gemini API key and press Enter.

### Step 4: Deploy Worker (1 min)

```bash
wrangler deploy
```

This will deploy your worker and give you a URL like:
```
https://bartender-api.YOUR_SUBDOMAIN.workers.dev
```

**IMPORTANT:** Copy this URL!

### Step 5: Update Frontend Configuration (1 min)

Edit `src/App.jsx` line 12:

Change:
```javascript
const WORKER_URL = '/api'
```

To:
```javascript
const WORKER_URL = 'https://bartender-api.YOUR_SUBDOMAIN.workers.dev/api'
```

Replace `YOUR_SUBDOMAIN` with your actual worker URL from Step 4.

### Step 6: Push to GitHub (5 min)

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - AI Bartender setup"

# Add your GitHub remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/tbullock-ai.git

# Push to GitHub
git push -u origin main
```

### Step 7: Deploy to Cloudflare Pages (5 min)

1. Go to https://dash.cloudflare.com/pages
2. Click "Create a project"
3. Click "Connect to Git"
4. Select your `tbullock-ai` repository
5. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Framework preset:** Vite
6. Click "Save and Deploy"
7. Wait ~2 minutes for build to complete

### Step 8: Set Up Custom Domain (Optional - 3 min)

If you own `tawiah.net` or another domain:

1. In Cloudflare Pages, go to your project
2. Click "Custom domains"
3. Click "Set up a custom domain"
4. Enter: `bartender.tawiah.net` (or your preferred subdomain)
5. Cloudflare will automatically configure DNS

## 🧪 Testing Locally

Before deploying, you can test everything locally:

```bash
# Terminal 1: Start the worker locally
wrangler dev worker/worker.js

# Terminal 2: Start the React dev server
npm run dev
```

Then open http://localhost:5173 in your browser.

**Note:** For local testing, the `WORKER_URL` in `src/App.jsx` should be:
```javascript
const WORKER_URL = 'http://localhost:8787/api'
```

Remember to change it back to your production worker URL before deploying!

## 🎉 That's It!

Your AI Bartender should now be live! Visit your Cloudflare Pages URL or custom domain to start using it.

## 📱 Add to Phone Home Screen

**iPhone:**
1. Open the site in Safari
2. Tap Share button
3. Scroll down and tap "Add to Home Screen"
4. Name it "🍹 Bartender"

**Android:**
1. Open the site in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home screen"
4. Name it "🍹 Bartender"

## ⚙️ Configuration

### Update AI Personality

Edit the `systemPrompt` in `worker/worker.js` (line 41-72) to change how the bartender responds.

### Change Free Tier Limits

- **Gemini:** 60 requests/min, 1,500 requests/day
- **Cloudflare Workers:** 100,000 requests/day
- **Cloudflare KV:** 100,000 reads/day, 1,000 writes/day
- **Cloudflare Pages:** Unlimited

All free! Perfect for home use.

## 🐛 Troubleshooting

### "AI service unavailable"
- Check your Gemini API key: `wrangler secret put GEMINI_API_KEY`
- Verify your API key at https://ai.google.dev/

### "Not Found" error
- Verify `WORKER_URL` in `src/App.jsx` is correct
- Make sure it ends with `/api`

### Worker not deploying
- Check KV namespace ID in `wrangler.toml`
- Run `wrangler login` again

### Build failed
- Delete `node_modules` and run `npm install` again
- Check Node.js version (needs 18+)

## 📚 Project Structure

```
tbullock-ai/
├── src/
│   ├── App.jsx          # Main React app
│   └── main.jsx         # React entry point
├── worker/
│   └── worker.js        # Cloudflare Worker (API)
├── public/
│   ├── robots.txt       # Prevent search indexing
│   └── manifest.json    # PWA manifest
├── package.json         # Dependencies
├── wrangler.toml        # Worker configuration
├── vite.config.js       # Build configuration
├── index.html           # HTML template
└── .gitignore           # Git ignore rules

# Documentation
├── START-HERE.md        # Original start guide
├── SETUP.md             # Original setup guide
├── README.md            # Project overview
├── DEPLOYMENT.md        # Deployment checklist
├── QUICK-REFERENCE.md   # Quick commands
├── ARCHITECTURE.md      # Technical details
└── GETTING-STARTED.md   # This file!

# Reference materials
├── 1000 Best Bartender's Recipes.txt
├── assets/reference/the-ideal-bartender-tom-bullock.txt
└── Home_Bar_Inventory.pdf
```

## 🆘 Need Help?

- Check the other documentation files (START-HERE.md, SETUP.md, etc.)
- Open an issue on GitHub
- Check Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Check Gemini API docs: https://ai.google.dev/docs

## 🎊 Next Steps

1. Add your bar inventory
2. Ask for your first drink recipe
3. Share the GitHub repo with other bartenders
4. Customize the AI personality
5. Enjoy your new AI bartender! 🍹

---

**Made with ❤️ for home bartenders everywhere**
