import { Link } from 'react-router-dom'
import type { Position } from '../../lib/types'
import { fmtUct } from '../../lib/format'

export function PositionCard({ position }: { position: Position }) {
  const outcome = position.outcome || position.side
  const stake = position.stake_amount ?? position.cost_basis
  const value = position.current_value ?? stake
  const payout = position.potential_payout ?? value
  const pnl = position.unrealized_pnl ?? (value - stake)

  return (
    <Link
      to={`/markets/${position.market_id}`}
      className="card card-hover block p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="line-clamp-2 flex-1 font-medium leading-snug text-[var(--color-text)]">
          {position.market?.question || 'Market position'}
        </p>
        <span className={`chip shrink-0 ${outcome === 'YES' ? 'chip-yes' : 'chip-no'}`}>
          {outcome}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-3">
        <div>
          <p className="label-caps">Staked</p>
          <p className="mt-1 font-data text-sm font-bold">{fmtUct(stake)}</p>
        </div>
        <div>
          <p className="label-caps">Est. value</p>
          <p className="mt-1 font-data text-sm font-bold text-[var(--color-gold)]">{fmtUct(value)}</p>
        </div>
        <div>
          <p className="label-caps">Max payout</p>
          <p className="mt-1 font-data text-sm font-bold text-[var(--color-yes)]">{fmtUct(payout)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between font-data text-[10px]">
        <span className="text-[var(--color-muted)]">
          {position.market?.status === 'open' ? '● Market open' : `Status: ${position.market?.status || 'unknown'}`}
        </span>
        <span className={pnl >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}>
          {pnl >= 0 ? '+' : ''}{fmtUct(pnl)} unrealized
        </span>
      </div>
    </Link>
  )
}