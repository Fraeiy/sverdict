import { useState, useEffect, useCallback } from 'react'
import * as api from '../lib/api'
import type { Market } from '../lib/types'

export function useMarkets(opts?: { autoLoad?: boolean }) {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (filters?: {
    search?: string
    category?: string
    status?: string
    trending?: boolean
    includePendingSeed?: boolean
  }) => {
    setError(null)
    try {
      const { markets: m } = await api.fetchMarkets(filters)
      setMarkets(m)
      return m
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load markets')
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const getMarket = useCallback(async (id: string) => {
    const { market } = await api.fetchMarket(id)
    return market
  }, [])

  useEffect(() => {
    if (opts?.autoLoad === false) return
    load({ trending: true, status: 'open' }).catch(() => {})
  }, [load, opts?.autoLoad])

  useEffect(() => {
    const unsub = api.subscribeToMarkets(() => {
      load({ trending: true }).catch(() => {})
    })
    return unsub
  }, [load])

  return { markets, loading, error, load, getMarket, setMarkets }
}