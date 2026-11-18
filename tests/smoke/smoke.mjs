// Mobile smoke test: serves the production build (dist/), runs the real
// worker/worker.js in-process against an in-memory KV with a fake Gemini, and
// drives the main flows in Chromium at iPhone 13 size.
//
//   npm run smoke                 # builds, then runs every scenario
//   SMOKE_ONLY=fab node tests/smoke/smoke.mjs   # one scenario (no build)
//
// Screenshots go to tests/smoke/out/ (git-ignored). Exit code 1 on any failure.
// First run on a new machine: `npx playwright install chromium`.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import { makeKV } from '../helpers/fake-kv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(__dirname, 'out')
const PORT = 4199
const LEGACY_API = 'https://bartender-api.eugene-tawiah.workers.dev/api'
fs.mkdirSync(OUT, { recursive: true })

// ---------- fake AI (Gemini) ----------
let nextAiText = 'Drink: Margarita\n\nIngredients:\n- 2 oz Tequila\n\nDid you make this drink?'
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: nextAiText }] } }] }), { status: 200 })
  }
  return realFetch(url, init)
}

const worker = (await import(path.join(ROOT, 'worker/worker.js'))).default

function seedData() {
  const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/initial-inventory.json'), 'utf8'))
  const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/initial-recipes.json'), 'utf8'))
  inv.forEach((it, i) => {
    if (!it.bottleSizeMl) it.bottleSizeMl = '750'
    if (!it.amountRemaining) it.amountRemaining = String(100 + (i * 37) % 650)
  })
  return {
    inventory: inv,
    recipes,
    shopping: [],
    chatHistory: [
      { role: 'user', content: 'Make me a Negroni' },
      { role: 'assistant', content: 'Drink: Negroni\n\nIngredients:\n- 1 oz Gin\n- 1 oz Campari\n- 1 oz Sweet Vermouth' }
    ]
  }
}

// One KV per scenario; the server looks it up per request.
let currentKV = makeKV(seedData())
let apiDelayMs = 80

async function runWorker(method, url, headers, body) {
  await new Promise(r => setTimeout(r, apiDelayMs))
  const req = new Request(url, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body })
  const resp = await worker.fetch(req, { BARTENDER_KV: currentKV, GEMINI_API_KEY: 'fake' })
  return { status: resp.status, headers: Object.fromEntries(resp.headers), body: await resp.text() }
}

// Apply Cloudflare Pages-style _headers rules so the smoke test runs under the real CSP.
function loadHeaderRules(file) {
  if (!fs.existsSync(file)) return []
  const rules = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} })
    else if (rules.length) { const i = line.indexOf(':'); rules.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim() }
  }
  return rules
}
const matches = (pattern, p) => pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : p === pattern
const headersFor = (rules, p) => Object.assign({}, ...rules.filter(r => matches(r.pattern, p)).map(r => r.headers))
const APP_HEADERS = loadHeaderRules(path.join(DIST, '_headers'))
const GUEST_HEADERS = loadHeaderRules(path.join(ROOT, 'barmenu-public', '_headers'))

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.css': 'text/css' }
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (pathname.startsWith('/api/')) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k)))
    const r = await runWorker(req.method, `http://localhost:${PORT}${req.url}`, headers, Buffer.concat(chunks).toString() || undefined)
    res.writeHead(r.status, r.headers)
    return res.end(r.body)
  }
  if (pathname.startsWith('/guest/')) {
    const guestDir = path.join(ROOT, 'barmenu-public')
    const f = path.join(guestDir, pathname.slice('/guest/'.length) || 'index.html')
    if (f.startsWith(guestDir) && fs.existsSync(f) && !fs.statSync(f).isDirectory()) {
      res.writeHead(200, { ...headersFor(GUEST_HEADERS, '/' + path.relative(guestDir, f)), 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' })
      return fs.createReadStream(f).pipe(res)
    }
  }
  let file = path.join(DIST, pathname)
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { ...headersFor(APP_HEADERS, '/' + path.relative(DIST, file)), 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(PORT, r))

const browser = await chromium.launch()
const results = []
const only = process.env.SMOKE_ONLY

async function newPage({ dark = false } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: dark ? 'dark' : 'light' })
  const page = await ctx.newPage()
  const errors = []
  const apiCalls = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) errors.push('CSP: ' + m.text().slice(0, 160)) })
  page.on('dialog', d => d.accept())
  page.on('request', r => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/')) apiCalls.push({ method: r.method(), path: u.pathname, body: r.postData() })
  })
  // Older builds call the workers.dev URL directly; route it to the same in-process Worker.
  await page.route(LEGACY_API + '/**', async route => {
    const req = route.request()
    const r = await runWorker(req.method(), req.url(), req.headers(), req.postData() || undefined)
    await route.fulfill({ status: r.status, headers: r.headers, body: r.body })
  })
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForTimeout(1200)
  return { ctx, page, errors, apiCalls }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const tab = (page, name) => page.locator(`button[title="${name}"]`)
const settle = (page, ms = 600) => page.waitForTimeout(ms)

async function scenario(name, fn) {
  if (only && !only.split(',').includes(name)) return
  currentKV = makeKV(seedData())
  apiDelayMs = 80
  const checks = []
  const expect = (label, ok, detail = '') => checks.push({ label, ok: Boolean(ok), detail })
  try {
    await fn(expect)
  } catch (e) {
    checks.push({ label: 'scenario ran without throwing', ok: false, detail: e.message.split('\n')[0] })
  }
  results.push({ name, checks })
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  [${name}] ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
}

// ---------------------------------------------------------------- scenarios

await scenario('chat-load', async expect => {
  const { ctx, page, errors, apiCalls } = await newPage()
  await shot(page, 'chat')
  const emptyPost = apiCalls.find(c => c.method === 'POST' && c.path.endsWith('/chat-history') && JSON.parse(c.body).chatHistory.length === 0)
  expect('does not save an empty chat history on startup', !emptyPost)
  expect('history still in storage', currentKV.json('chatHistory').length === 2)
  expect('Menu tab is tappable on the chat screen', await tab(page, 'Menu').click({ trial: true, timeout: 2000 }).then(() => true, () => false))
  expect('no page errors or CSP violations', errors.length === 0, errors.join('; '))
  const head = await page.request.get(`http://localhost:${PORT}/`)
  expect('app sends a CSP', Boolean(head.headers()['content-security-policy']))
  await ctx.close()
})

await scenario('failed-load', async expect => {
  currentKV = makeKV({ ...seedData(), inventory: [{ type: 'Gin', name: 'MY REAL GIN', bottleSizeMl: '750', amountRemaining: '500' }] })
  currentKV.failGets.add('inventory')
  currentKV.failGets.add('chatHistory')
  currentKV.failGets.add('shopping')
  currentKV.put('shopping', JSON.stringify([{ name: 'Limes', brand: '', type: 'Garnish' }]))
  const { ctx, page } = await newPage()
  await shot(page, 'failed-load')
  expect('real inventory not replaced by demo data', currentKV.json('inventory').some(i => i.name === 'MY REAL GIN'), `count=${currentKV.json('inventory').length}`)
  expect('chat history not wiped', currentKV.json('chatHistory').length === 2)
  expect('shopping list not wiped', currentKV.json('shopping').length === 1)
  expect('user is told loading failed', await page.getByText(/couldn.t load/i).first().isVisible().catch(() => false))
  await ctx.close()
})

await scenario('quick-adjust', async expect => {
  const { ctx, page } = await newPage()
  await tab(page, 'Inventory').click(); await settle(page)
  await page.getByText('Vodka', { exact: true }).first().click(); await settle(page)
  const name = 'New Amsterdam Vodka'
  const before = parseFloat(currentKV.json('inventory').find(i => i.name === name).amountRemaining)
  await page.getByRole('button', { name: /-Shot|Remove 1 shot/ }).first().click()
  await settle(page, 1500)
  const after = parseFloat(currentKV.json('inventory').find(i => i.name === name).amountRemaining)
  expect('-Shot is saved to storage', Math.abs(before - after - 44.36) < 1, `before=${before} after=${after}`)
  await shot(page, 'inventory-after-shot')
  expect('toast offers Undo', await page.getByRole('button', { name: 'Undo' }).isVisible().catch(() => false))
  await page.getByRole('button', { name: 'Undo' }).click(); await settle(page, 1500)
  const undone = parseFloat(currentKV.json('inventory').find(i => i.name === name).amountRemaining)
  expect('Undo restores and saves the amount', undone === before, `after undo=${undone}`)
  await ctx.close()
})

await scenario('shopping-low-stock', async expect => {
  const { ctx, page, errors } = await newPage()
  await tab(page, 'Inventory').click(); await settle(page)
  await page.getByText('Vodka', { exact: true }).first().click(); await settle(page)
  await page.getByRole('button', { name: /Add to Shopping List/ }).first().click(); await settle(page, 1200)
  const shopping = currentKV.json('shopping') || []
  expect('low-stock bottle stays on the shopping list', shopping.some(i => i.name === 'New Amsterdam Vodka'), `shopping=${JSON.stringify(shopping.map(i => i.name))}`)
  await page.evaluate(() => { window.__shared = null; navigator.share = async (data) => { window.__shared = data } })
  await page.getByRole('button', { name: /Share list/ }).click(); await settle(page, 300)
  expect('Share list sends the list to the share sheet', /New Amsterdam Vodka/.test((await page.evaluate(() => window.__shared))?.text || ''))
  expect('no page errors', errors.length === 0, errors.join('; '))
  await ctx.close()
})

await scenario('fab-add', async expect => {
  const { ctx, page } = await newPage()
  await tab(page, 'Inventory').click(); await settle(page)
  await page.getByRole('button', { name: /Quick actions|^\+$/ }).click(); await settle(page, 300)
  await page.getByRole('button', { name: /Add Inventory/ }).click(); await settle(page, 300)
  await shot(page, 'add-item-modal')
  await page.locator('input[placeholder="e.g. Grey Goose Vodka"]').fill('Smoke Test Gin')
  await page.getByRole('button', { name: 'Done' }).click()
  await settle(page, 1500)
  expect('bottle added via + is saved', currentKV.json('inventory').some(i => i.name === 'Smoke Test Gin'))
  await ctx.close()
})

await scenario('export-everything', async expect => {
  const { ctx, page } = await newPage()
  await tab(page, 'Inventory').click(); await settle(page)
  await page.getByRole('button', { name: 'Maintenance menu' }).click(); await settle(page, 300)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export everything/ }).click()])
  const file = path.join(OUT, 'backup.json')
  await download.saveAs(file)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  expect('backup file has inventory, favorites, chat', data.inventory.length > 0 && data.recipes.length > 0 && data.chatHistory.length === 2)
  expect('backup file named with the date', /^bar-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename())
  await ctx.close()
})

await scenario('bottle-picker', async expect => {
  const seed = seedData()
  seed.inventory.push({ type: 'Vodka', name: "Tito's Vodka", bottleSizeMl: '750', amountRemaining: '700' })
  seed.inventory.push({ type: 'Vodka', name: 'Grey Goose Vodka', bottleSizeMl: '750', amountRemaining: '600' })
  currentKV = makeKV(seed)
  const { ctx, page, errors } = await newPage()
  await tab(page, 'Favorites').click(); await settle(page)
  await page.locator('button:has-text("Make This Drink"):not([disabled])').first().click(); await settle(page)
  await shot(page, 'bottle-picker')
  expect('bottle picker opens (no white screen)', await page.getByText('Select Bottles').isVisible().catch(() => false))
  await page.locator('label:has-text("Tito")').first().click()
  await page.getByRole('button', { name: 'Make Drink' }).click(); await settle(page, 1500)
  const titos = currentKV.json('inventory').find(i => i.name === "Tito's Vodka")
  expect('chosen bottle was used and saved', parseFloat(titos.amountRemaining) < 700, `Tito's=${titos.amountRemaining}`)
  expect('stays on Favorites (no recipe editor popping up)', !(await page.getByText('Edit Recipe').isVisible().catch(() => false)))
  const remembered = (currentKV.json('recipes') || []).find(r => r.selectedBottles && Object.values(r.selectedBottles).includes("Tito's Vodka"))
  expect('bottle choice remembered on the favorite', Boolean(remembered))
  await page.locator('button:has-text("Make This Drink"):not([disabled])').first().click(); await settle(page)
  expect('picker pre-selects the remembered bottle', await page.locator('label:has-text("Tito") input[type=radio]').first().isChecked().catch(() => false))
  expect('no page errors', errors.length === 0, errors.join('; '))
  await ctx.close()
})

await scenario('two-phones', async expect => {
  const a = await newPage()
  const b = await newPage()
  const amount = name => parseFloat(currentKV.json('inventory').find(i => i.name === name).amountRemaining)
  for (const p of [a.page, b.page]) { await tab(p, 'Inventory').click(); await settle(p) }
  // Phone A: -Shot on the first Vodka. Phone B (loaded before A saved): -Shot on the first Gin.
  await a.page.getByText('Vodka', { exact: true }).first().click(); await settle(a.page)
  await b.page.getByText('Gin', { exact: true }).first().click(); await settle(b.page)
  const vodka = 'New Amsterdam Vodka'
  const gin = currentKV.json('inventory').filter(i => i.type === 'Gin').map(i => i.name).sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))[0]
  const [v0, g0] = [amount(vodka), amount(gin)]
  await a.page.getByRole('button', { name: /-Shot|Remove 1 shot/ }).first().click(); await settle(a.page, 1200)
  await b.page.getByRole('button', { name: /-Shot|Remove 1 shot/ }).first().click(); await settle(b.page, 2000)
  expect("phone A's pour survived phone B's save", amount(vodka) < v0, `${vodka}: ${v0} -> ${amount(vodka)}`)
  expect("phone B's pour saved too", amount(gin) < g0, `${gin}: ${g0} -> ${amount(gin)}`)
  expect('no page errors on either phone', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join('; '))
  await a.ctx.close(); await b.ctx.close()
})

await scenario('wake-lock', async expect => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  await ctx.addInitScript(() => {
    window.__wake = { requested: 0, released: 0 }
    Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wake.requested++; return { release: async () => { window.__wake.released++ }, addEventListener() {} } } } })
  })
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORT}/`); await page.waitForTimeout(1200)
  await tab(page, 'Favorites').click(); await settle(page)
  await page.getByRole('button', { name: 'Show Details' }).first().click(); await settle(page, 400)
  expect('screen wake lock requested while recipe open', await page.evaluate(() => window.__wake.requested) === 1)
  expect('user is told the screen stays on', await page.getByText('Screen stays on').isVisible().catch(() => false))
  await page.getByRole('button', { name: 'Hide Details' }).first().click(); await settle(page, 300)
  expect('wake lock released when closed', await page.evaluate(() => window.__wake.released) === 1)
  await ctx.close()
})

await scenario('delete-favorite', async expect => {
  const seed = seedData()
  seed.recipes = seed.recipes.slice(0, 1)
  currentKV = makeKV(seed)
  const { ctx, page, errors } = await newPage()
  await tab(page, 'Favorites').click(); await settle(page)
  await page.getByRole('button', { name: 'Delete' }).first().click(); await settle(page, 1200)
  expect('deleting the last favorite is saved', (currentKV.json('recipes') || []).length === 0)
  await page.reload(); await page.waitForTimeout(1200)
  expect('emptied favorites stay empty after reload (no demo re-seed)', (currentKV.json('recipes') || []).length === 0)
  expect('no page errors', errors.length === 0, errors.join('; '))
  await ctx.close()
})

await scenario('chat-inventory-update', async expect => {
  const { ctx, page } = await newPage()
  nextAiText = 'Used: 2 shots New Amsterdam Vodka\n\n[INVENTORY_UPDATE]{\n  "updates": [\n    { "bottleName": "New Amsterdam Vodka", "mlSubtracted": 90 }\n  ]\n}\n\nInventory updated!'
  const before = parseFloat(currentKV.json('inventory').find(i => i.name === 'New Amsterdam Vodka').amountRemaining)
  await page.locator('input[placeholder^="Ask for a drink"]').fill('I had two shots of New Amsterdam Vodka')
  await page.getByRole('button', { name: 'Send' }).click(); await settle(page, 1500)
  await shot(page, 'chat-inventory-update')
  const after = parseFloat(currentKV.json('inventory').find(i => i.name === 'New Amsterdam Vodka').amountRemaining)
  expect('AI inventory update applied', before - after === 90, `before=${before} after=${after}`)
  expect('raw [INVENTORY_UPDATE] block hidden', !(await page.content()).includes('[INVENTORY_UPDATE]'))
  await ctx.close()
})

await scenario('menu', async expect => {
  const { ctx, page, errors } = await newPage()
  await tab(page, 'Menu').click(); await settle(page, 1000)
  await shot(page, 'menu-editor')
  await page.getByRole('button', { name: 'Add Blood Orange Cosmo to menu' }).click(); await settle(page, 300)
  await page.getByRole('button', { name: 'Publish' }).click(); await settle(page, 1200)
  expect('menu publishes', (currentKV.json('menu:live')?.items || []).length === 1)
  // empty it again: remove the only item and publish
  await page.getByRole('button', { name: 'Remove Blood Orange Cosmo from menu' }).click(); await settle(page, 300)
  await page.getByRole('button', { name: 'Publish' }).click(); await settle(page, 1200)
  expect('menu can be emptied', (currentKV.json('menu:live')?.items || []).length === 0)
  await page.getByRole('button', { name: /Show Versions/ }).click(); await settle(page, 300)
  expect('version history has real dates', !(await page.getByText('Invalid Date').count()))
  await shot(page, 'menu-editor-versions')
  const narrow = await page.evaluate(() => [...document.querySelectorAll('h3')].filter(h => /Available Recipes|Current Menu/.test(h.textContent)).map(h => Math.round(h.getBoundingClientRect().width)))
  expect('columns stacked on phone (full width)', narrow.every(w => w > 300), narrow.join(','))
  expect('no page errors', errors.length === 0, errors.join('; '))
  await ctx.close()
})

await scenario('guest-menu', async expect => {
  currentKV.put('menu:live', JSON.stringify({
    id: 'menu-primary', version: 1,
    items: [{ id: 'm1', name: '<img src=x onerror="window.__xss=1">Evil Fizz', description: '<script>window.__xss=2</script>gin, lime', primarySpirit: 'gin', status: 'active' },
      { id: 'm2', name: 'Ginger Highball', description: 'soda, ginger', primarySpirit: 'mixer', status: 'active' }]
  }))
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const cspErrors = []
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text().slice(0, 160)) })
  const resp = await page.goto(`http://localhost:${PORT}/guest/index.html`); await page.waitForTimeout(1200)
  expect('guest page sends a CSP', Boolean(resp.headers()['content-security-policy']))
  expect('no CSP violations on guest page', cspErrors.length === 0, cspErrors.join('; '))
  await shot(page, 'guest-menu')
  expect('menu text is not executed as HTML', await page.evaluate(() => window.__xss === undefined))
  expect('menu text shown literally', await page.getByText('Evil Fizz').first().isVisible().catch(() => false))
  expect('mixer drinks are listed', await page.getByText('Ginger Highball').first().isVisible().catch(() => false))
  await ctx.close()
})

await scenario('dark', async expect => {
  const { ctx, page } = await newPage({ dark: true })
  await shot(page, 'dark-chat')
  await tab(page, 'Inventory').click(); await settle(page)
  await page.getByText('Vodka', { exact: true }).first().click(); await settle(page)
  await shot(page, 'dark-inventory')
  const titleColor = await page.getByText('New Amsterdam Vodka').first().evaluate(el => {
    const fg = getComputedStyle(el).color
    let n = el
    let bg = 'rgba(0, 0, 0, 0)'
    while (n && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement }
    return { fg, bg }
  })
  const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const [l1, l2] = [lum(titleColor.fg), lum(titleColor.bg)].sort((a, b) => b - a)
  const ratio = (l1 + 0.05) / (l2 + 0.05)
  expect('dark-mode bottle names readable (contrast >= 4.5)', ratio >= 4.5, `ratio=${ratio.toFixed(2)} fg=${titleColor.fg} bg=${titleColor.bg}`)
  await tab(page, 'Favorites').click(); await settle(page)
  await shot(page, 'dark-favorites')
  await ctx.close()
})

await scenario('a11y', async expect => {
  const { ctx, page } = await newPage()
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect('pinch-zoom allowed', !/user-scalable=no|maximum-scale=1/.test(viewport), viewport)
  expect('tabs have readable names', await page.getByRole('button', { name: /^Inventory, \d+ items$/ }).count() === 1)
  const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, 'utf8') : null
  for (const view of ['Chat', 'Inventory', 'Favorites']) {
    await tab(page, view).click(); await settle(page, 600)
    if (view === 'Inventory') { await page.getByText('Vodka', { exact: true }).first().click(); await settle(page, 300) }
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44 })
      .map(el => `${(el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}px`))
    expect(`${view}: tap targets at least 44px tall`, small.length === 0, small.slice(0, 6).join(', '))
    if (axeSrc) {
      await page.evaluate(axeSrc)
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => `${v.id}(${v.nodes.length}): ` + v.nodes.slice(0, 3).map(n => (n.any[0]?.data ? `${n.any[0].data.fgColor} on ${n.any[0].data.bgColor} ${n.any[0].data.contrastRatio}` : '') + ' ' + n.html.slice(0, 60)).join(' | ')))
      expect(`${view}: no axe WCAG A/AA violations`, violations.length === 0, violations.join(', '))
    }
  }
  await ctx.close()
})

await scenario('offline', async expect => {
  const { ctx, page } = await newPage()
  await page.context().setOffline(true)
  await page.locator('input[placeholder^="Ask for a drink"]').fill('Make me a daiquiri')
  await page.getByRole('button', { name: 'Send' }).click(); await settle(page, 800)
  await shot(page, 'offline-chat')
  expect('offline error shown in chat', await page.getByText(/You're offline/).first().isVisible().catch(() => false))
  expect('typed message restored for resending', (await page.locator('input[placeholder^="Ask for a drink"]').inputValue()) === 'Make me a daiquiri')
  await ctx.close()
})

await scenario('weight', async expect => {
  const { ctx, page } = await newPage()
  const sizes = await page.evaluate(() => performance.getEntriesByType('resource').map(e => [new URL(e.name).pathname, e.encodedBodySize || e.transferSize || 0]))
  const logo = sizes.filter(([p]) => p.includes('logo')).reduce((s, [, n]) => s + n, 0)
  expect('header logo under 50 KB', logo < 50_000, `logo bytes=${logo}`)
  await ctx.close()
})

// ---------------------------------------------------------------- report
await browser.close()
server.close()
const failed = results.flatMap(r => r.checks.filter(c => !c.ok).map(c => `[${r.name}] ${c.label}`))
const total = results.reduce((n, r) => n + r.checks.length, 0)
console.log(`\n${total - failed.length}/${total} checks passed. Screenshots: ${path.relative(ROOT, OUT)}/`)
process.exit(failed.length ? 1 : 0)
