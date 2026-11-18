# Backlog

Ideas worth doing next, roughly in priority order. Nothing here is required for
the app to work.

1. **Check the Cloudflare Access JWT in the Worker** (defence in depth for D2).
   Verify `Cf-Access-Jwt-Assertion` against
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` for every route
   except `GET /api/menu`. Start in "log only" mode, then enforce. Needs the
   Access app's AUD tag as a Worker variable.
2. **Offline support (service worker).** Cache the app shell so it opens
   without signal, and queue saves while offline (the save queue in
   `src/lib/saveQueue.js` and `listSync.js` is already built for retrying).
   Must handle an expired Access session cleanly.
3. **Commit `package-lock.json`** so builds are reproducible.
4. **Upgrade Vite** (5 → current) to clear the dev-server advisory.
5. **Restore button in the app** for the daily backups (`GET /api/backups`
   already lists them).
6. **Strict consistency** for saves (Durable Object or D1) if KV's eventual
   consistency ever causes a lost update.
7. **Split `App.jsx`** into Inventory/Favorites/Chat components when there's a
   feature that needs it.
8. **Barcode scan to add a bottle** (Android Chrome supports `BarcodeDetector`;
   iOS Safari doesn't yet).
