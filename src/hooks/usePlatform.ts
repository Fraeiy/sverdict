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
  const auth = useMemo(() => authFromIdentity(identity), [identity])

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

  return {
    user,
    auth,
    treasuryAddress,
    loading,
    isAdmin: !!user?.is_admin,
    async createMarket(payload: {
      question: string
      description?: string
      resolutionCriteria?: string
      category: string
      daysOpen: number
    }) {
      if (!auth) throw new Error('Not connected')
      const { market } = await api.adminCreateMarket(auth, payload)
      return market as Market
    },
    async resolveMarket(marketId: string, resolution: 'YES' | 'NO') {
      if (!auth) throw new Error('Not connected')
      return api.adminResolveMarket(auth, marketId, resolution)
    },
    async closeMarket(marketId: string) {
      if (!auth) throw new Error('Not connected')
      return api.adminCloseMarket(auth, marketId)
    },
    async withdrawalQueue() {
      if (!auth) throw new Error('Not connected')
      return api.adminWithdrawalQueue(auth)
    },
    async listPendingWithdrawals() {
      if (!auth) throw new Error('Not connected')
      return api.adminListPendingWithdrawals(auth)
    },
    async fulfillWithdrawal(withdrawalId: string, txReference?: string) {
      if (!auth) throw new Error('Not connected')
      return api.adminFulfillWithdrawal(auth, withdrawalId, txReference)
    },
  }
}