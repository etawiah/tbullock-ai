# Notes for AI coding agents

This is a personal home-bar app used by two people, mostly on phones.
The owner is not a software engineer: explain changes plainly.

Read first: `docs/architecture.md`, `docs/data-model.md`, `docs/known-issues.md`.

## Rules

- **Never risk stored data.** A failed load must never be followed by a save,
  and every save of a list must go through the existing helpers
  (`commitInventory` / `inventorySync`, `syncedLists`, `worker/lists.js saveList`)
  so revisions, conflict merging and daily backups keep working.
- **Ask before:** changing the shape of stored KV data or adding KV keys,
  deleting data or features, adding a dependency, or changing deployment
  (`wrangler.toml`, `_headers`, `package.json` deploy scripts, Cloudflare
  settings). Say what changes and how to roll it back.
- Keep `wrangler.toml` free of `route`/`routes` and keep `workers_dev = false`
  and `preview_urls = false` (routes live in the Cloudflare dashboard).
- Don't redesign or rewrite working code for style; fix what's there.
- One logical change per commit, with a test. Run `npm test` after each
  commit and `npm run smoke` after UI changes (screenshots land in
  `tests/smoke/out/`).
- Pure logic goes in `src/lib/` or `worker/*.js` so `node --test` can cover it.
- Colours: use the existing palette (it passes WCAG AA and is covered by the
  dark-mode remap in `index.html`). Tap targets ≥ 44px.
- Update `docs/known-issues.md` and the relevant review/plan file when you fix
  or defer something.
