import { useEffect, useState } from 'react'

// Keep the screen on while `active` is true (e.g. a recipe is open while you mix).
// Uses the Screen Wake Lock API where available (iOS 16.4+, Android Chrome);
// does nothing elsewhere. The browser drops the lock when the app is hidden,
// so it is re-requested when the app becomes visible again.
export function useWakeLock(active) {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return undefined
    let lock = null
    let cancelled = false

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) { lock.release(); return }
        setHeld(true)
        lock.addEventListener?.('release', () => setHeld(false))
      } catch {
        setHeld(false) // e.g. battery saver; not an error worth showing
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible' && !cancelled) acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release?.()
      setHeld(false)
    }
  }, [active])

  return held
}
