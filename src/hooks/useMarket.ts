import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { getBackendMode } from '../lib/config'
import type { Market } from '../lib/types'

export function useMarket(marketId: string | undefined) {
  const [market, setMarket] = useState<Market | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oddsUpdated, setOddsUpdated] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (!marketId) {
      setMarket(null)
      setLoading(false)
      return null
    }
    try {
      const { market: m } = await api.fetchMarket(marketId)
      setMarket(m)
      setError(null)
      return m
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load market')
      setMarket(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [marketId])

  useEffect(() => {
    setLoading(true)
    refresh().catch(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!marketId || getBackendMode() !== 'supabase') return

    const unsub = api.subscribeToMarket(marketId, updated => {
      setMarket(prev => {
        if (!prev) return updated
        const poolsChanged = prev.yes_pool !== updated.yes_pool
          || prev.no_pool !== updated.no_pool
          || prev.volume !== updated.volume
          || prev.status !== updated.status
        if (poolsChanged) {
          if (flashTimer.current) clearTimeout(flashTimer.current)
          setOddsUpdated(true)
          flashTimer.current = setTimeout(() => setOddsUpdated(false), 2000)
        }
        return updated
      })
    })

    return () => {
      unsub()
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [marketId])

  return { market, loading, error, refresh, oddsUpdated, isLive: getBackendMode() === 'supabase' }
}