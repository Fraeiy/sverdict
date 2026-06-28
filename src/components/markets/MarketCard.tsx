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
      className="group block rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-5 transition hover:border-blue-500/40 hover:bg-[var(--color-surface-3)]"
    >
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${
          market.status === 'open' ? 'bg-emerald-500/15 text-emerald-400' :
          market.status === 'resolved' ? 'bg-amber-500/15 text-amber-400' :
          'bg-slate-500/15 text-slate-400'
        }`}>
          {market.status}
        </span>
        <span className="text-slate-500">{market.category}</span>
        {trending && <span className="ml-auto font-medium text-amber-400">Trending</span>}
      </div>

      <h3 className="mb-4 line-clamp-2 text-base font-semibold leading-snug group-hover:text-white">
        {market.question}
      </h3>

      <div className="mb-2 flex justify-between text-sm font-medium">
        <span className="text-emerald-400">YES {yes}%</span>
        <span className="text-rose-400">NO {no}%</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${yes}%` }} />
      </div>

      <div className="flex justify-between text-xs text-slate-400">
        <span>Vol {fmtUct(market.volume || 0)}</span>
        <span>{timeRemaining(market.deadline)}</span>
      </div>
    </Link>
  )
}