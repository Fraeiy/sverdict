import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import type { HistoryEntry, WalletIdentity } from '../lib/types'

function authFrom(identity: WalletIdentity | null): api.AuthHeaders | null {
  if (!identity?.directAddress && !identity?.nametag) return null
  return {
    walletAddress: identity.directAddress || identity.nametag || '',
    nametag: identity.nametag,
    publicKey: identity.publicKey,
  }
}

export function useHistory(identity: WalletIdentity | null) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const auth = useMemo(() => authFrom(identity), [identity])

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