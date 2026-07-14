import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShareSheet } from '../share/ShareSheet'
import { ShareIcon } from '../ui/ShareIcon'
import type { Market } from '../../lib/types'
import { marketShareText, marketShareUrl } from '../../lib/share'
import { fmtUct, noProbability, timeRemaining, yesProbability } from '../../lib/format'

export function MarketCard({ market }: { market: Market }) {
  const [shareOpen, setShareOpen] = useState(false)
  const trending = market.trending_score > 50

  const yes = yesProbability(market)
  const no = noProbability(market)

  return (
    <>
      <div className="card card-hover card-glow card-3d group relative p-5">
        <div className="mb-3 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className={`chip ${
              market.status === 'open' ? 'chip-open' :
              market.status === 'resolved' ? 'chip-gold' :
              'chip-neutral'
            }`}>
              {market.status}
            </span>
            <span className="font-data text-[10px] text-[var(--color-muted)]">{market.category}</span>
            {trending && (
              <span className="chip chip-gold">▲ Trending</span>
            )}
          </div>
          <button
            type="button"
            onClick={e => { e.preventDefault(); setShareOpen(true) }}
            className="btn-ghost share-btn shrink-0 rounded-md p-2"
            aria-label="Share market"
          >
            <ShareIcon />
          </button>
        </div>

        <Link to={`/markets/${market.id}`} className="block">
          <h3 className="mb-4 line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] transition group-hover:text-[var(--color-gold-bright)]">
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
      </div>

      <ShareSheet
        open={shareOpen}
        title="Share market"
        shareText={marketShareText(market)}
        shareUrl={marketShareUrl(market.id)}
        onClose={() => setShareOpen(false)}
        preview={{
          headline: market.question,
          description: `YES ${yes}% · NO ${no}% · ${timeRemaining(market.deadline)}`,
          badge: `${yes}% YES`,
          imageAccent: yes,
        }}
      />
    </>
  )
}