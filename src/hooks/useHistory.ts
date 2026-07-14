import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import { getBackendMode } from '../lib/config'
import type { HistoryEntry, WalletIdentity, WithdrawalStatus } from '../lib/types'

const POLL_MS = 45_000
const PENDING_POLL_MS = 15_000

const PENDING_STATUSES: WithdrawalStatus[] = ['submitted', 'processing']

export function isPendingWithdrawal(entry: HistoryEntry) {
  return entry.type === 'withdrawal'
    && !!entry.status
    && PENDING_STATUSES.includes(entry.status as WithdrawalStatus)
}

export function useHistory(identity: WalletIdentity | null, opts?: { poll?: boolean; enabled?: boolean }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const auth = useMemo(
    () => authFromIdentity(identity),
    [identity?.nametag, identity?.directAddress, identity?.publicKey],
  )
  const enabled = opts?.enabled !== false
  const shouldPoll = enabled && opts?.poll !== false && getBackendMode() === 'supabase'

  const pendingWithdrawals = useMemo(
    () => entries.filter(isPendingWithdrawal),
    [entries],
  )

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
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    refresh().catch(() => setLoading(false))
  }, [enabled, refresh])

  useEffect(() => {
    if (!auth || !shouldPoll) return

    const pollMs = pendingWithdrawals.length > 0 ? PENDING_POLL_MS : POLL_MS
    const interval = setInterval(() => {
      refresh().catch(() => {})
    }, pollMs)

    return () => clearInterval(interval)
  }, [auth, shouldPoll, refresh, pendingWithdrawals.length])

  return { entries, loading, pendingWithdrawals, refresh }
}