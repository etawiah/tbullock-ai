// Serialises saves for one stored list so that:
//  - a save requested while another is in flight is never dropped, and
//  - rapid changes are coalesced (the latest value is what gets saved).
// `save(value)` must return a promise. `getValue()` returns the latest value.
export function createSaveQueue({ save, getValue, onStatus = () => {} }) {
  let running = false
  let pending = false
  let idle = Promise.resolve()

  async function run() {
    running = true
    let lastError = null
    do {
      pending = false
      onStatus('saving')
      try {
        await save(getValue())
        lastError = null
      } catch (error) {
        lastError = error
      }
    } while (pending)
    running = false
    onStatus(lastError ? 'error' : 'saved', lastError)
    if (lastError) throw lastError
  }

  return {
    // Request a save of the latest value. Resolves when that value (or a newer one) is saved.
    request() {
      if (running) {
        pending = true
        return idle
      }
      idle = run()
      idle.catch(() => {})
      return idle
    },
    get busy() { return running }
  }
}
