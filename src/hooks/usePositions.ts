import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import type { Portfolio, WalletIdentity } from '../lib/types'

function authFrom(identity: WalletIdentity | null): api.AuthHeaders | null {
  if (!identity?.directAddress && !identity?.nametag) return null
  return {
    walletAddress: identity.directAddress || identity.nametag || '',
    nametag: identity.nametag,
    publicKey: identity.publicKey,
  }
}

export function usePositions(identity: WalletIdentity | null) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const auth = useMemo(() => authFrom(identity), [identity])

  const refresh = useCallback(async () => {
    if (!auth) {
      setPortfolio(null)
      setLoading(false)
      return null
    }
    setError(null)
    try {
      const p = await api.fetchPortfolio(auth)
      setPortfolio(p)
      return p
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio')
      throw e
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    setLoading(true)
    refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    if (!auth) return
    const interval = setInterval(() => refresh().catch(() => {}), 15000)
    return () => clearInterval(interval)
  }, [auth, refresh])

  const placeStake = useCallback(async (payload: {
    marketId: string
    outcome: 'YES' | 'NO'
    amount: number
    txReference?: string
    memo?: string
  }) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.placeStake(auth, payload)
    setPortfolio(result.portfolio)
    return result.portfolio
  }, [auth])

  return {
    portfolio,
    loading,
    error,
    auth,
    refresh,
    placeStake,
    openPositions: portfolio?.open_positions ?? [],
    resolvedPositions: portfolio?.resolved_positions ?? [],
  }
}