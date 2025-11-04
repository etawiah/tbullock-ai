# Deployment Checklist

Use this checklist to ensure you've completed all steps:

## ☐ Prerequisites Setup

- [ ] Created Cloudflare account (free)
- [ ] Created Google account (if you don't have one)
- [ ] Created GitHub account (free)
- [ ] Installed Node.js 18+ (optional, for local dev)

## ☐ API Key Setup

- [ ] Visited https://ai.google.dev/
- [ ] Created Gemini API key
- [ ] Saved API key in a safe place

## ☐ GitHub Setup

- [ ] Created new repository: `ai-bartender`
- [ ] Set repository to Public
- [ ] Uploaded all project files
- [ ] Repository is accessible at github.com/YOUR_USERNAME/ai-bartender

## ☐ Cloudflare Worker Setup

- [ ] Installed Wrangler CLI: `npm install -g wrangler`
- [ ] Logged in to Cloudflare: `wrangler login`
- [ ] Created KV namespace: `wrangler kv:namespace create "BARTENDER_KV"`
- [ ] Updated `wrangler.toml` with KV namespace ID
- [ ] Set API key secret: `wrangler secret put GEMINI_API_KEY`
- [ ] Deployed worker: `wrangler deploy`
- [ ] Saved worker URL (e.g., https://bartender-api.YOUR_NAME.workers.dev)

## ☐ Frontend Configuration

- [ ] Updated `src/App.jsx` with worker URL
- [ ] Changed `const WORKER_URL = '/api'` to `const WORKER_URL = 'https://YOUR_WORKER_URL/api'`
- [ ] Committed changes to GitHub

## ☐ Cloudflare Pages Setup

- [ ] Connected GitHub repository to Cloudflare Pages
- [ ] Set build command: `npm run build`
- [ ] Set build output directory: `dist`
- [ ] Deployment successful
- [ ] Site is accessible at the provided pages.dev URL

## ☐ Custom Domain Setup

- [ ] Added custom domain in Cloudflare Pages
- [ ] DNS configured for bartender.tawiah.net
- [ ] SSL certificate active
- [ ] Site accessible at bartender.tawiah.net

## ☐ Testing

- [ ] Opened bartender.tawiah.net in browser
- [ ] Chat interface loads correctly
- [ ] Can send messages to AI
- [ ] Inventory button works
- [ ] Can add inventory items
- [ ] Can save inventory
- [ ] Inventory persists after refresh
- [ ] Tested on mobile device
- [ ] Added to home screen (mobile)

## ☐ Security & Privacy

- [ ] Confirmed robots.txt is blocking crawlers
- [ ] API key is NOT visible in browser
- [ ] Worker URL is correct in frontend
- [ ] Only you can access the site (or it's password protected if needed)

## ☐ Optional Enhancements

- [ ] Added Cloudflare Access for authentication
- [ ] Customized AI prompt in worker.js
- [ ] Uploaded bartending books as reference
- [ ] Created backup of inventory
- [ ] Shared repository link with others

## 🎉 Congratulations!

If all items are checked, your AI Bartender is live and ready to mix drinks!

## Troubleshooting

If something didn't work:

1. **Chat returns "AI service unavailable"**
   - Check Gemini API key is set correctly
   - Verify you have free tier quota remaining
   - Test API key at https://ai.google.dev/

2. **"Not Found" or network errors**
   - Verify WORKER_URL in App.jsx is correct
   - Check worker deployed successfully
   - Ensure KV namespace ID is correct in wrangler.toml

3. **Inventory not saving**
   - Check browser console for errors
   - Verify KV namespace is bound to worker
   - Try clearing browser cache

4. **Build failed on Cloudflare Pages**
   - Check build logs for errors
   - Verify package.json has all dependencies
   - Try deploying again

5. **Custom domain not working**
   - Wait 5-10 minutes for DNS propagation
   - Clear browser cache
   - Check Cloudflare DNS settings

Need more help? Open an issue on GitHub or check the documentation!
