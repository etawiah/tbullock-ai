// Conflict-safe saving for one stored list.
//
// Each change is recorded as a function of the list (an "op"). Saves send the
// revision we last saw. If the other phone saved in between, the server answers
// 409 with its current list; we replay our unsaved ops on top of it and retry,
// so both phones' changes survive. Ops marked `replace` (a whole-list edit, like
// Edit mode's Save) can't be merged, so we ask before overwriting.
export function createListSync({ post, getValue, setValue, extract, confirmOverwrite = () => true, maxAttempts = 3 }) {
  let rev = null
  let ops = []

  return {
    get rev() { return rev },
    get pending() { return ops.length },
    // After loading from the server: remember its revision, forget local ops.
    reset(newRev) {
      rev = Number.isInteger(newRev) ? newRev : null
      ops = []
    },
    setRev(newRev) {
      if (Number.isInteger(newRev)) rev = newRev
    },
    record(fn, { replace = false } = {}) {
      ops.push({ fn, replace })
    },
    // Save the current value. Resolves when saved; rejects on other errors.
    async save() {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const sentOps = ops.length
        try {
          const result = await post(getValue(), rev)
          if (Number.isInteger(result?.rev)) rev = result.rev
          ops = ops.slice(sentOps)
          return { status: 'saved' }
        } catch (error) {
          if (error?.status !== 409) throw error
          const serverItems = extract(error.body)
          rev = Number.isInteger(error.body?.rev) ? error.body.rev : rev
          if (ops.some(op => op.replace) && !confirmOverwrite()) {
            ops = []
            setValue(serverItems)
            return { status: 'discarded' }
          }
          setValue(ops.reduce((acc, op) => op.fn(acc), serverItems))
        }
      }
      throw new Error('This list keeps changing on another device. Please try again.')
    }
  }
}
