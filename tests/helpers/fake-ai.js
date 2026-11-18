// Replaces global fetch for Gemini/Groq calls made by the Worker.
export function installFakeAI() {
  const realFetch = globalThis.fetch
  const state = { reply: 'OK', calls: [] }
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('generativelanguage.googleapis.com')) {
      state.calls.push({ url: u, headers: init.headers, body: init.body ? JSON.parse(init.body) : null })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: state.reply }] } }] }), { status: 200 })
    }
    return realFetch(url, init)
  }
  state.restore = () => { globalThis.fetch = realFetch }
  return state
}
