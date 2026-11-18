# Known issues

_Updated 2026-11-18 after the review in
[plans/review-2026-11-17.md](plans/review-2026-11-17.md). Fixed items are listed
in that file. This page lists what is still open._

## Open

| ID | Issue | Why it's still open / workaround |
|---|---|---|
| D1 | **Production was deployed from code that isn't in git.** The deployed Worker's prompt code differs from `worker/worker.js` (e.g. a priority-sorted inventory prompt with a truncation notice). The deployed app bundle couldn't be inspected (behind Access). | The repo version is the one that's been reviewed and tested. Deploying from the repo replaces the old prompt wording. If you have newer local changes (e.g. in your OneDrive copy), compare them with this branch before deploying. |
| D2 | **The Worker trusts its network edge.** It doesn't verify who is calling; Cloudflare Access and a WAF rule do that. | Safe as long as routes and rules stay as described in architecture.md. Checking the Access JWT in the Worker is in the backlog (needs the Access application's AUD tag configured as a Worker variable). |
| D3 | **KV is eventually consistent.** Two phones saving within the same moment from *different* Cloudflare locations could both pass the revision check. | Unlikely for one household, and daily backups cover it. A Durable Object or D1 would make it strict. |
| D4 | **Chat history has no conflict check.** If both phones chat at the same time, the last one to save wins the stored history. | Low impact (conversation log only). |
| D5 | **`npm audit`: vite/esbuild dev-server advisories.** | Only affects `npm run dev` on an untrusted network; nothing deployed. Fix needs a Vite major upgrade (5 → 8). |
| D6 | **No offline mode.** The app needs a connection to open and to save. Failed saves show "Not saved · Retry" and failed chat messages are put back in the box. | Service worker + offline queue is in the backlog; it interacts with Cloudflare Access session expiry and needs care. |
| D7 | **`App.jsx` is ~4,000 lines with the inventory card duplicated.** | Works. Splitting it is a refactor with no user-visible benefit, so it was left alone per the review brief. |
| D8 | **Daily backup dates are UTC.** An evening (US) save lands in the next day's backup key. | Cosmetic. |
| D9 | **`package-lock.json` is git-ignored**, so installs aren't pinned. | Consider committing the lockfile. (Not changed here because Pages builds may depend on the current behaviour.) |

## Behaviour notes (not bugs)

- Edit mode is still a "make several changes, then Save" form. Everything else
  saves immediately.
- Dark mode remaps the app's light colours with CSS in `index.html`. New
  components should use the existing colour values so they're covered.
- The Undo toast lasts 5 seconds.
- The floating + button still floats over whichever card is under it while
  you scroll (normal for a floating button); lists have extra bottom space so
  any card can be scrolled clear of it.
