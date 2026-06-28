import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import type { Claim, WalletIdentity } from '../lib/types'

function authFrom(identity: WalletIdentity | null): api.AuthHeaders | null {
  if (!identity?.directAddress && !identity?.nametag) return null
  return {
    walletAddress: identity.directAddress || identity.nametag || '',
    nametag: identity.nametag,
    publicKey: identity.publicKey,
  }
}

export function useClaims(identity: WalletIdentity | null) {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const auth = useMemo(() => authFrom(identity), [identity])

  const refresh = useCallback(async () => {
    if (!auth) {
      setClaims([])
      setLoading(false)
      return []
    }
    setError(null)
    try {
      const { claims: c } = await api.fetchClaims(auth)
      setClaims(c)
      return c
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claims')
      throw e
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const claimReward = useCallback(async (claimId: string) => {
    if (!auth) throw new Error('Connect your Sphere wallet')
    const result = await api.claimReward(auth, claimId)
    await refresh()
    return result
  }, [auth, refresh])

  const pendingClaims = claims.filter(c => c.status === 'pending')
  const totalClaimable = pendingClaims.reduce((s, c) => s + Number(c.amount), 0)

  return {
    claims,
    pendingClaims,
    totalClaimable,
    loading,
    error,
    refresh,
    claimReward,
  }
}