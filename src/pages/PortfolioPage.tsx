import { ClaimCard } from '../components/portfolio/ClaimCard'
import { PositionCard } from '../components/portfolio/PositionCard'
import { useClaims } from '../hooks/useClaims'
import { usePositions } from '../hooks/usePositions'
import type { WalletIdentity } from '../lib/types'
import { fmtUct } from '../lib/format'

export function PortfolioPage({ identity }: { identity: WalletIdentity | null }) {
  const { portfolio, openPositions, resolvedPositions, loading } = usePositions(identity)
  const { pendingClaims, totalClaimable, claimReward } = useClaims(identity)

  if (loading && !portfolio) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
        Loading portfolio…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="mt-2 text-slate-400">Your open positions and claimable rewards</p>
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-5">
          <p className="text-xs text-slate-500">Total staked</p>
          <p className="mt-1 text-2xl font-bold">{fmtUct(portfolio?.total_staked ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-5">
          <p className="text-xs text-slate-500">Estimated value</p>
          <p className="mt-1 text-2xl font-bold">{fmtUct(portfolio?.estimated_value ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-xs text-emerald-400">Claimable rewards</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{fmtUct(totalClaimable)}</p>
        </div>
      </div>

      {pendingClaims.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Claim rewards</h2>
          <div className="space-y-3">
            {pendingClaims.map(c => (
              <ClaimCard key={c.id} claim={c} onClaim={claimReward} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Open positions</h2>
        {openPositions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-slate-500">
            No open positions yet — stake on a market to get started
          </div>
        ) : (
          <div className="space-y-3">
            {openPositions.map(p => <PositionCard key={p.id} position={p} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Resolved positions</h2>
        {resolvedPositions.length === 0 ? (
          <p className="text-sm text-slate-500">No resolved positions yet</p>
        ) : (
          <div className="space-y-3">
            {resolvedPositions.map(p => (
              <div key={p.id} className="rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-5 opacity-80">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{p.market?.question || p.market_id}</p>
                  <span className={`rounded-lg px-2 py-1 text-xs font-bold ${
                    (p.outcome || p.side) === 'YES' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}>
                    {p.outcome || p.side}
                  </span>
                </div>
                <div className="mt-3 flex gap-6 text-sm text-slate-400">
                  <span>Staked {fmtUct(p.stake_amount ?? p.cost_basis)}</span>
                  <span className={(p.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    PnL {(p.pnl ?? 0) >= 0 ? '+' : ''}{fmtUct(p.pnl ?? 0)}
                  </span>
                  {(p.payout ?? 0) > 0 && <span>Payout {fmtUct(p.payout ?? 0)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}