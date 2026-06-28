import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import type { HistoryEntry, WalletIdentity } from '../lib/types'

export function useHistory(identity: WalletIdentity | null) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const auth = useMemo(() => authFromIdentity(identity), [identity])

  const refresh = useCallback(async () => {
    if (!auth) {
      setEntries([])
      setLoading(false)
      return []
    }
    try {
      const { history } = await api.fetchHistory(auth)
      setEntries(history)
      return history
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    setLoading(true)
    refresh().catch(() => setLoading(false))
  }, [refresh])

  return { entries, loading, refresh }
}