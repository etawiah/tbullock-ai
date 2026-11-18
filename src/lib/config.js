// Base URL for the Worker API. Production serves the Worker on the same domain
// under /api (bartender.tawiah.net/api/* and barmenu.tawiah.net/api/menu), behind
// Cloudflare Access. Override for special setups with VITE_API_BASE at build time.
export const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
