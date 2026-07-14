import { useEffect } from 'react'

/** Poll only while the tab is visible — saves edge calls when user is away. */
export function useVisibleInterval(
  callback: () => void,
  ms: number,
  enabled = true,
  immediate = true,
) {
  useEffect(() => {
    if (!enabled || ms <= 0) return

    const tick = () => {
      if (document.visibilityState === 'visible') callback()
    }

    if (immediate) tick()
    const interval = setInterval(tick, ms)

    const onVisible = () => {
      if (document.visibilityState === 'visible') callback()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [callback, ms, enabled, immediate])
}