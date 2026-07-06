import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import { getBackendMode } from '../lib/config'
import type { HistoryEntry, WalletIdentity } from '../lib/types'

const POLL_MS = 45_000

export function useHistory(identity: WalletIdentity | null, opts?: { poll?: boolean }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const auth = useMemo(() => authFromIdentity(identity), [identity])
  const shouldPoll = opts?.poll !== false && getBackendMode() === 'supabase'

  const refresh = useCallback(async () => {
    if (!auth) {
      setEntries([])
      setLoading(false)
      return []
    }
    try {
      const { history } = await api.fetchHistory(auth)
      setEntries(history ?? [])
      return history ?? []
    } catch {
      setEntries([])
      return []
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    setLoading(true)
    refresh().catch(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!auth || !shouldPoll) return

    const interval = setInterval(() => {
      refresh().catch(() => {})
    }, POLL_MS)

    return () => clearInterval(interval)
  }, [auth, shouldPoll, refresh])

  return { entries, loading, refresh }
}