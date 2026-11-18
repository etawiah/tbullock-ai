# 📋 Quick Reference Card

Save this file! It has all the important links and commands you'll need.

## 🔗 Important Links

### Setup & Documentation
- **Get Gemini API Key:** https://ai.google.dev/
- **Cloudflare Dashboard:** https://dash.cloudflare.com/
- **Cloudflare Pages:** https://dash.cloudflare.com/pages
- **GitHub:** https://github.com/

### Your Sites (after deployment)
- **Bartender Site:** bartender.tawiah.net
- **Worker URL:** (you'll get this after deploying)
- **GitHub Repo:** github.com/YOUR_USERNAME/ai-bartender

## 💻 Essential Commands

### Initial Setup
```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv:namespace create "BARTENDER_KV"

# Set API key (run this, then paste your key)
wrangler secret put GEMINI_API_KEY

# Deploy worker
wrangler deploy
```

### Local Development
```bash
# Install dependencies
npm install

# Start dev server (frontend)
npm run dev

# Start worker locally (in another terminal)
wrangler dev worker/worker.js
```

### Deployment
```bash
# Build and deploy frontend
npm run build
wrangler pages deploy dist

# Deploy just the worker
wrangler deploy
```

### Update API Key
```bash
# If you need to change your Gemini API key
wrangler secret put GEMINI_API_KEY
```

## 📝 Files You'll Need to Edit

### 1. wrangler.toml
**Line to change:** `id = "YOUR_KV_NAMESPACE_ID"`
**Change to:** The ID you get from `wrangler kv:namespace create`

### 2. src/App.jsx
**Line to change:** `const WORKER_URL = '/api'`
**Change to:** `const WORKER_URL = 'https://YOUR-WORKER-URL/api'`

## 🔐 Security Checklist

- [ ] API key set via `wrangler secret` (not in code)
- [ ] `.gitignore` includes `.env` and `.dev.vars`
- [ ] `robots.txt` is in the `public` folder
- [ ] Worker URL updated in App.jsx
- [ ] KV namespace ID updated in wrangler.toml

## 📱 Mobile Setup

### iPhone (Safari)
1. Open bartender.tawiah.net
2. Tap Share button (box with arrow)
3. Scroll down → "Add to Home Screen"
4. Name it "🍹 Bartender"
5. Tap "Add"

### Android (Chrome)
1. Open bartender.tawiah.net
2. Tap menu (3 dots)
3. Tap "Add to Home screen"
4. Name it "🍹 Bartender"
5. Tap "Add"

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "AI service unavailable" | Check API key: `wrangler secret put GEMINI_API_KEY` |
| "Not Found" error | Verify WORKER_URL in App.jsx is correct |
| Inventory not saving | Check KV namespace ID in wrangler.toml |
| Build failed | Check build logs in Cloudflare Pages dashboard |
| Worker not deploying | Run `wrangler login` and try again |

## 📊 Free Tier Limits (FYI)

You'll NEVER hit these with home use:

| Service | Daily Limit | Monthly Limit |
|---------|-------------|---------------|
| Gemini AI | 1,500 requests | ~45,000 requests |
| CF Workers | 100,000 requests | ~3M requests |
| CF KV Reads | 100,000 reads | ~3M reads |
| CF KV Writes | 1,000 writes | ~30k writes |
| CF Pages | Unlimited | Unlimited |

## 🎯 Common Tasks

### Add New Inventory Items
1. Go to bartender.tawiah.net
2. Click "Inventory"
3. Click "Edit"
4. Click "+ Add Item"
5. Fill in name, quantity, unit
6. Click "Save"

### Update Inventory After Making Drinks
**Option 1:** Manual update
1. Open Inventory
2. Click Edit
3. Update quantities
4. Save

**Option 2:** Tell the AI
1. Chat: "I just made 2 margaritas"
2. AI will tell you what was used
3. Manually update inventory

### Get Drink Suggestions
- "What can I make with vodka?"
- "Suggest a tropical drink"
- "Make me something with gin and lime"
- "I need a drink for 4 people"

### Check What You Have
- "What's in my bar?"
- "Do I have enough for margaritas?"
- "What am I low on?"

## 📞 Need Help?

1. Check SETUP.md for detailed instructions
2. Check DEPLOYMENT.md for deployment checklist
3. Check README.md for full documentation
4. Open GitHub issue
5. Check Cloudflare docs: https://developers.cloudflare.com/

## 🔄 Keeping Updated

### Update Your Gemini API Key
```bash
wrangler secret put GEMINI_API_KEY
```

### Update Worker Code
```bash
# Make changes to worker/worker.js
wrangler deploy
```

### Update Frontend
```bash
# Make changes to src files
# Commit to GitHub
# Cloudflare Pages will auto-deploy
```

### Force Redeploy
```bash
npm run build
wrangler pages deploy dist --project-name=ai-bartender
```

## 🎉 You're All Set!

Keep this file handy for quick reference. Most of the time you'll just use the site - you won't need these commands unless you're updating something.

Cheers! 🍸
