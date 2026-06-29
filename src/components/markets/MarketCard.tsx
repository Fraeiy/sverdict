import { Link } from 'react-router-dom'
import type { Market } from '../../lib/types'
import { fmtUct, noProbability, timeRemaining, yesProbability } from '../../lib/format'

export function MarketCard({ market }: { market: Market }) {
  const yes = yesProbability(market)
  const no = noProbability(market)
  const trending = market.trending_score > 50

  return (
    <Link
      to={`/markets/${market.id}`}
      className="card card-hover card-glow group block p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className={`chip ${
          market.status === 'open' ? 'chip-open' :
          market.status === 'resolved' ? 'chip-gold' :
          'chip-neutral'
        }`}>
          {market.status}
        </span>
        <span className="font-data text-[10px] text-[var(--color-muted)]">{market.category}</span>
        {trending && (
          <span className="ml-auto font-data text-[10px] font-bold text-[var(--color-gold)]">▲ TRENDING</span>
        )}
      </div>

      <h3 className="mb-4 line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-gold-bright)]">
        {market.question}
      </h3>

      <div className="mb-2 flex justify-between font-data text-[11px] font-bold">
        <span className="text-[var(--color-yes)]">YES {yes}%</span>
        <span className="text-[var(--color-no)]">NO {no}%</span>
      </div>
      <div className="odds-track mb-4">
        <div className="odds-fill" style={{ width: `${yes}%` }} />
      </div>

      <div className="flex justify-between border-t border-[var(--color-border)] pt-3 font-data text-[10px] text-[var(--color-muted)]">
        <span>VOL <span className="text-[var(--color-gold)]">{fmtUct(market.volume || 0)}</span></span>
        <span>{timeRemaining(market.deadline)}</span>
      </div>
    </Link>
  )
}