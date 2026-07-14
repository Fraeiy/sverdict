import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import type { Portfolio, WalletIdentity } from '../lib/types'
import { useVisibleInterval } from './useVisibleInterval'

function cacheKey(auth: { walletAddress: string }) {
  return `sverdict-portfolio:${auth.walletAddress}`
}

function loadPortfolioCache(auth: { walletAddress: string }): Portfolio | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(auth))
    if (!raw) return null
    return JSON.parse(raw) as Portfolio
  } catch {
    return null
  }
}

function savePortfolioCache(auth: { walletAddress: string }, portfolio: Portfolio) {
  try {
    sessionStorage.setItem(cacheKey(auth), JSON.stringify(portfolio))
  } catch { /* ignore */ }
}

export function usePositions(identity: WalletIdentity | null) {
  const auth = useMemo(() => authFromIdentity(identity), [identity])
  const authRef = useRef(auth)
  authRef.current = auth

  const [portfolio, setPortfolio] = useState<Portfolio | null>(() =>
    auth ? loadPortfolioCache(auth) : null,
  )
  const [loading, setLoading] = useState(() => !(auth && loadPortfolioCache(auth)))
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const a = authRef.current
    if (!a) {
      setPortfolio(null)
      setLoading(false)
      return null
    }
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const p = await api.fetchPortfolio(a)
      setPortfolio(p)
      savePortfolioCache(a, p)
      return p
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio')
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const a = authRef.current
    if (!a) {
      setPortfolio(null)
      setLoading(false)
      return
    }
    const cached = loadPortfolioCache(a)
    if (cached) {
      setPortfolio(cached)
      setLoading(false)
      refresh({ silent: true }).catch(() => {})
    } else {
      setLoading(true)
      refresh().catch(() => {})
    }
  }, [auth, refresh])

  useVisibleInterval(
    () => { refresh({ silent: true }).catch(() => {}) },
    30_000,
    !!auth,
    false,
  )

  const deposit = useCallback(async (amount: number, txReference?: string, paymentMemo?: string) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.deposit(auth, amount, txReference, paymentMemo)
    setPortfolio(result.portfolio)
    if (auth) savePortfolioCache(auth, result.portfolio)
    return result.portfolio
  }, [auth])

  const withdraw = useCallback(async (amount: number) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.withdraw(auth, amount)
    setPortfolio(result.portfolio)
    if (auth) savePortfolioCache(auth, result.portfolio)
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
    if (auth) savePortfolioCache(auth, result.portfolio)
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
    pendingWithdrawals: portfolio?.pending_withdrawals ?? [],
  }
}