import { useState } from 'react'
import type { Claim } from '../../lib/types'
import { fmtUct } from '../../lib/format'

type Props = {
  claim: Claim
  onClaim: (claimId: string) => Promise<void>
}

export function ClaimCard({ claim, onClaim }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(claim.status === 'claimed')

  async function handleClaim() {
    setLoading(true)
    try {
      await onClaim(claim.id)
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{claim.market?.question || 'Resolved market'}</p>
          <p className="mt-1 text-sm text-slate-400">You won this market</p>
        </div>
        <p className="text-lg font-bold text-emerald-400">{fmtUct(claim.amount)}</p>
      </div>

      {done ? (
        <p className="text-sm font-medium text-emerald-400">Reward claimed — sent to your Sphere wallet</p>
      ) : (
        <button
          onClick={handleClaim}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-emerald-600 py-3 font-semibold transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Confirming…' : `Claim ${fmtUct(claim.amount)}`}
        </button>
      )}
    </div>
  )
}