import { Link } from 'react-router-dom'
import type { Position } from '../../lib/types'
import { fmtUct } from '../../lib/format'

export function PositionCard({ position }: { position: Position }) {
  const outcome = position.outcome || position.side
  const stake = position.stake_amount ?? position.cost_basis
  const value = position.current_value ?? stake
  const payout = position.potential_payout ?? value

  return (
    <Link
      to={`/markets/${position.market_id}`}
      className="block rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-5 transition hover:border-white/15"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="line-clamp-2 flex-1 font-medium leading-snug">
          {position.market?.question || 'Market position'}
        </p>
        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
          outcome === 'YES' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
        }`}>
          {outcome}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Staked</p>
          <p className="font-semibold">{fmtUct(stake)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Est. value</p>
          <p className="font-semibold">{fmtUct(value)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Max payout</p>
          <p className="font-semibold text-emerald-400">{fmtUct(payout)}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {position.market?.status === 'open' ? 'Market open' : `Status: ${position.market?.status || 'unknown'}`}
      </p>
    </Link>
  )
}