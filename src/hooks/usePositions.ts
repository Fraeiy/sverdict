import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import type { Portfolio, WalletIdentity } from '../lib/types'
import { useVisibleInterval } from './useVisibleInterval'

export function usePositions(identity: WalletIdentity | null) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const auth = useMemo(() => authFromIdentity(identity), [identity])

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

  useVisibleInterval(() => { refresh().catch(() => {}) }, 15_000, !!auth)

  const deposit = useCallback(async (amount: number, txReference?: string, paymentMemo?: string) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.deposit(auth, amount, txReference, paymentMemo)
    setPortfolio(result.portfolio)
    return result.portfolio
  }, [auth])

  const withdraw = useCallback(async (amount: number) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.withdraw(auth, amount)
    setPortfolio(result.portfolio)
    return result.portfolio
  }, [auth])

  const placeTrade = useCallback(async (payload: {
    marketId: string
    outcome: 'YES' | 'NO'
    amount: number
  }) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.placeTrade(auth, payload)
    setPortfolio(result.portfolio)
    return result.portfolio
  }, [auth])

  return {
    portfolio,
    loading,
    error,
    auth,
    refresh,
    deposit,
    withdraw,
    placeTrade,
    availableBalance: portfolio?.available_balance ?? 0,
    openPositions: portfolio?.open_positions ?? [],
    resolvedPositions: portfolio?.resolved_positions ?? [],
  }
}