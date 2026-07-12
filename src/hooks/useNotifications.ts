import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import { getBackendMode } from '../lib/config'
import type { AppNotification, WalletIdentity } from '../lib/types'
import { useVisibleInterval } from './useVisibleInterval'

const POLL_MS = 30_000

export function useNotifications(identity: WalletIdentity | null) {
  const auth = useMemo(() => authFromIdentity(identity), [identity])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!auth || getBackendMode() !== 'supabase') {
      setNotifications([])
      setUnread(0)
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { notifications: list, unread: n } = await api.fetchNotifications(auth)
      setNotifications(list || [])
      setUnread(n ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    setLoading(true)
    refresh().catch(() => setLoading(false))
  }, [refresh])

  useVisibleInterval(
    () => { refresh().catch(() => {}) },
    POLL_MS,
    !!auth && getBackendMode() === 'supabase',
  )

  const markAllRead = useCallback(async () => {
    if (!auth) return
    await api.markNotificationsRead(auth, { all: true })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }, [auth])

  const markRead = useCallback(async (id: string) => {
    if (!auth) return
    await api.markNotificationsRead(auth, { ids: [id] })
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
    setUnread(prev => Math.max(0, prev - 1))
  }, [auth])

  return { notifications, unread, loading, error, refresh, markAllRead, markRead }
}