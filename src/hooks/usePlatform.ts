import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Market, Notification, Portfolio, User } from '../lib/types'
import * as api from '../lib/api'
import { getBackendMode, getTreasuryAddressFallback } from '../lib/config'
import type { WalletIdentity } from '../lib/types'

function walletAuth(identity: WalletIdentity | null): api.AuthHeaders | null {
  if (!identity?.directAddress && !identity?.nametag) return null
  return {
    walletAddress: identity.directAddress || identity.nametag || '',
    nametag: identity.nametag,
    publicKey: identity.publicKey,
  }
}

export function usePlatform(identity: WalletIdentity | null) {
  const [user, setUser] = useState<User | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [treasuryAddress, setTreasuryAddress] = useState(getTreasuryAddressFallback())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const backendMode = getBackendMode()

  const auth = useMemo(() => walletAuth(identity), [identity])

  const refreshMarkets = useCallback(async (opts?: { search?: string; category?: string; status?: string; trending?: boolean }) => {
    const { markets: m } = await api.fetchMarkets(opts)
    setMarkets(m)
    return m
  }, [])

  const refreshPortfolio = useCallback(async () => {
    if (!auth) return null
    const p = await api.fetchPortfolio(auth)
    setPortfolio(p)
    return p
  }, [auth])

  const refreshNotifications = useCallback(async () => {
    if (!auth) return []
    const { notifications: n } = await api.fetchNotifications(auth)
    setNotifications(n)
    return n
  }, [auth])

  const refreshAll = useCallback(async () => {
    setError(null)
    try {
      await refreshMarkets({ trending: true })
      if (auth) {
        const { user: u, portfolio: p } = await api.authenticate(auth)
        setUser(u)
        setPortfolio(p)
        await refreshNotifications()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load platform data')
    } finally {
      setLoading(false)
    }
  }, [auth, refreshMarkets, refreshNotifications])

  useEffect(() => {
    api.fetchTreasury()
      .then(t => setTreasuryAddress(t.address || getTreasuryAddressFallback()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    refreshAll()
  }, [auth, refreshAll])

  // Polling fallback (REST mode or backup)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshMarkets({ trending: true }).catch(() => {})
      if (auth) {
        refreshPortfolio().catch(() => {})
        refreshNotifications().catch(() => {})
      }
    }, backendMode === 'supabase' ? 30000 : 8000)
    return () => clearInterval(interval)
  }, [auth, backendMode, refreshMarkets, refreshPortfolio, refreshNotifications])

  // Supabase Realtime
  useEffect(() => {
    const unsubMarkets = api.subscribeToMarkets(() => {
      refreshMarkets({ trending: true }).catch(() => {})
    })
    return unsubMarkets
  }, [refreshMarkets])

  useEffect(() => {
    if (!user?.id) return
    const unsub = api.subscribeToNotifications(user.id, (n) => {
      setNotifications(prev => [n, ...prev.filter(x => x.id !== n.id)])
    })
    return unsub
  }, [user?.id])

  const unreadCount = notifications.filter(n => !n.read).length

  return {
    user,
    portfolio,
    markets,
    notifications,
    treasuryAddress,
    loading,
    error,
    unreadCount,
    auth,
    backendMode,
    refreshMarkets,
    refreshPortfolio,
    refreshNotifications,
    refreshAll,
    async deposit(amount: number, txReference?: string) {
      if (!auth) throw new Error('Not connected')
      const result = await api.deposit(auth, amount, txReference)
      setPortfolio(result.portfolio)
      await refreshNotifications()
      return result.portfolio
    },
    async withdraw(amount: number) {
      if (!auth) throw new Error('Not connected')
      const result = await api.withdraw(auth, amount)
      setPortfolio(result.portfolio)
      await refreshNotifications()
      return result.portfolio
    },
    async trade(payload: { marketId: string; side: 'YES' | 'NO'; amount: number; signature?: string; signedMessage?: string }) {
      if (!auth) throw new Error('Not connected')
      const result = await api.placeTrade(auth, payload)
      setPortfolio(result.portfolio)
      await refreshMarkets()
      await refreshNotifications()
      return result.portfolio
    },
    async createMarket(payload: { question: string; category: string; daysOpen: number }) {
      if (!auth) throw new Error('Not connected')
      const { market } = await api.adminCreateMarket(auth, payload)
      await refreshMarkets()
      return market
    },
    async closeMarket(marketId: string) {
      if (!auth) throw new Error('Not connected')
      await api.adminCloseMarket(auth, marketId)
      await refreshMarkets()
    },
    async resolveMarket(marketId: string, resolution: 'YES' | 'NO') {
      if (!auth) throw new Error('Not connected')
      await api.adminResolveMarket(auth, marketId, resolution)
      await refreshMarkets()
      await refreshPortfolio()
      await refreshNotifications()
    },
    async markRead(id: string) {
      if (!auth) return
      await api.markNotificationRead(auth, id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    },
    async markAllRead() {
      if (!auth) return
      await api.markAllNotificationsRead(auth)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    },
  }
}