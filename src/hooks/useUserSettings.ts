import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../lib/api'
import { authFromIdentity } from '../lib/auth'
import { getBackendMode } from '../lib/config'
import {
  cachePreferences,
  DEFAULT_USER_PREFERENCES,
  loadCachedPreferences,
  normalizePreferences,
  type UserPreferences,
} from '../lib/userSettings'
import type { WalletIdentity } from '../lib/types'

function settingsSyncWarning(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : ''
  if (!msg || msg === 'Error' || msg === 'Unexpected error') {
    return 'Could not sync settings — using preferences saved on this device.'
  }
  if (/non-2xx|failed to fetch|network|timeout|520/i.test(msg)) {
    return 'Could not reach server — using preferences saved on this device.'
  }
  return msg
}

export function useUserSettings(identity: WalletIdentity | null) {
  const auth = useMemo(() => authFromIdentity(identity), [identity])
  const [preferences, setPreferences] = useState<UserPreferences>(loadCachedPreferences)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!auth) {
      setPreferences(loadCachedPreferences())
      setLoading(false)
      return
    }
    setError(null)
    try {
      if (getBackendMode() === 'supabase') {
        const { preferences: p } = await api.fetchSettings(auth)
        const normalized = normalizePreferences(p)
        setPreferences(normalized)
        cachePreferences(normalized)
      } else {
        setPreferences(loadCachedPreferences())
      }
    } catch (e) {
      setPreferences(loadCachedPreferences())
      setError(settingsSyncWarning(e))
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    setLoading(true)
    refresh().catch(() => setLoading(false))
  }, [refresh])

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const next = normalizePreferences({ ...preferences, ...patch })
    setPreferences(next)
    cachePreferences(next)

    if (!auth) return next

    setSaving(true)
    setError(null)
    try {
      if (getBackendMode() === 'supabase') {
        const { preferences: saved } = await api.updateSettings(auth, next)
        const normalized = normalizePreferences(saved)
        setPreferences(normalized)
        cachePreferences(normalized)
        return normalized
      }
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
      throw e
    } finally {
      setSaving(false)
    }
  }, [auth, preferences])

  return {
    preferences,
    loading,
    saving,
    error,
    refresh,
    updatePreferences,
    defaults: DEFAULT_USER_PREFERENCES,
  }
}