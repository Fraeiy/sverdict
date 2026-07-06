import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Market, User, WalletIdentity } from '../lib/types'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import { getTreasuryAddressFallback } from '../lib/config'

/** Admin + auth utilities for Sphere-native app */
export function usePlatform(identity: WalletIdentity | null) {
  const [user, setUser] = useState<User | null>(null)
  const [treasuryAddress, setTreasuryAddress] = useState(getTreasuryAddressFallback())
  const [loading, setLoading] = useState(true)
  const auth = useMemo(
    () => authFromIdentity(identity),
    [identity?.nametag, identity?.directAddress, identity?.publicKey],
  )

  const bootstrap = useCallback(async () => {
    if (!auth) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const { user: u } = await api.authenticate(auth)
      setUser(u)
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    api.fetchTreasury()
      .then(t => setTreasuryAddress(t.address || getTreasuryAddressFallback()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    bootstrap().catch(() => setLoading(false))
  }, [bootstrap])

  const createMarket = useCallback(async (payload: {
    question: string
    description?: string
    resolutionCriteria?: string
    category: string
    daysOpen: number
  }) => {
    if (!auth) throw new Error('Not connected')
    const { market } = await api.adminCreateMarket(auth, payload)
    return market as Market
  }, [auth])

  const resolveMarket = useCallback(async (marketId: string, resolution: 'YES' | 'NO') => {
    if (!auth) throw new Error('Not connected')
    return api.adminResolveMarket(auth, marketId, resolution)
  }, [auth])

  const closeMarket = useCallback(async (marketId: string) => {
    if (!auth) throw new Error('Not connected')
    return api.adminCloseMarket(auth, marketId)
  }, [auth])

  const withdrawalQueue = useCallback(async () => {
    if (!auth) throw new Error('Not connected')
    return api.adminWithdrawalQueue(auth)
  }, [auth])

  const listPendingWithdrawals = useCallback(async () => {
    if (!auth) throw new Error('Not connected')
    return api.adminListPendingWithdrawals(auth)
  }, [auth])

  const fulfillWithdrawal = useCallback(async (withdrawalId: string, txReference?: string) => {
    if (!auth) throw new Error('Not connected')
    return api.adminFulfillWithdrawal(auth, withdrawalId, txReference)
  }, [auth])

  return useMemo(() => ({
    user,
    auth,
    treasuryAddress,
    loading,
    isAdmin: !!user?.is_admin,
    createMarket,
    resolveMarket,
    closeMarket,
    withdrawalQueue,
    listPendingWithdrawals,
    fulfillWithdrawal,
  }), [
    user,
    auth,
    treasuryAddress,
    loading,
    createMarket,
    resolveMarket,
    closeMarket,
    withdrawalQueue,
    listPendingWithdrawals,
    fulfillWithdrawal,
  ])
}

export type PlatformApi = ReturnType<typeof usePlatform>