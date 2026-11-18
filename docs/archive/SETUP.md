# 🚀 Quick Setup Guide for Eugene

Hey Eugene! Here's a streamlined guide to get your bartender up and running.

## Part 1: Get Your API Key (5 minutes)

1. Go to https://ai.google.dev/
2. Click "Get API key in Google AI Studio"
3. Sign in with your Google account
4. Click "Get API key" → "Create API key"
5. Copy the key somewhere safe (you'll need it in Step 3)

## Part 2: Upload to GitHub (10 minutes)

1. Go to https://github.com/new
2. Repository name: `ai-bartender`
3. Make it **Public** (so others can use it too!)
4. Don't initialize with README (we already have one)
5. Click "Create repository"

6. Download these files to your computer
7. In the GitHub page, click "uploading an existing file"
8. Drag and drop ALL the files/folders
9. Click "Commit changes"

## Part 3: Deploy Worker (10 minutes)

### Option A: If you're comfortable with Terminal/Command Prompt

1. Open Terminal (Mac) or Command Prompt (Windows)
2. Run these commands one at a time:

```bash
npm install -g wrangler
wrangler login
```

3. Create your KV storage:
```bash
wrangler kv:namespace create "BARTENDER_KV"
```

4. Copy the ID it gives you and edit `wrangler.toml`:
   - Find the line: `id = "YOUR_KV_NAMESPACE_ID"`
   - Replace with: `id = "abc123xyz"` (use your actual ID)

5. Set your API key:
```bash
wrangler secret put GEMINI_API_KEY
```
   - Paste your Gemini API key when asked

6. Deploy:
```bash
wrangler deploy
```

7. **IMPORTANT:** Copy the worker URL it shows you (looks like: `https://bartender-api.YOUR_NAME.workers.dev`)

### Option B: If Terminal seems scary (Use Cloudflare Dashboard)

I'll walk you through this in person or over video chat - it's easier to show than explain!

## Part 4: Update the Code

1. In your GitHub repo, click on `src/App.jsx`
2. Click the pencil icon (Edit)
3. Find line 11: `const WORKER_URL = '/api'`
4. Change it to: `const WORKER_URL = 'https://YOUR-WORKER-URL-FROM-STEP-3/api'`
5. Click "Commit changes"

## Part 5: Deploy to Cloudflare Pages (5 minutes)

1. Go to https://dash.cloudflare.com/pages
2. Click "Create a project"
3. Click "Connect to Git"
4. Select your `ai-bartender` repository
5. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
6. Click "Save and Deploy"
7. Wait ~2 minutes for it to build

## Part 6: Set Up Your Custom Domain (3 minutes)

1. In Cloudflare Pages, click your project
2. Go to "Custom domains"
3. Click "Set up a custom domain"
4. Enter: `bartender.tawiah.net`
5. Click "Activate domain"

Done! Visit **bartender.tawiah.net** and you should see your bartender!

## Part 7: Add Your Inventory

1. Open bartender.tawiah.net on your phone
2. Click "Inventory (0)"
3. Click "Edit"
4. Add all your bottles and ingredients
5. Click "Save"

## Adding to Home Screen (iPhone)

1. Open bartender.tawiah.net in Safari
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Name it "🍹 Bartender"
5. Tap "Add"

Now you have a bartender icon on your phone! 🎉

## Troubleshooting

### "AI service unavailable"
- Your Gemini API key might be wrong
- Run: `wrangler secret put GEMINI_API_KEY` and enter it again

### "Not Found" error
- Check that `WORKER_URL` in `src/App.jsx` is correct
- Make sure it ends with `/api`

### Worker not deploying
- Make sure you updated the KV namespace ID in `wrangler.toml`
- Try running `wrangler login` again

## Need Help?

Call/text me and we'll get it working together! This should all be free and work great for your home bar.

Cheers! 🍸
