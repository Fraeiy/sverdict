import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShareSheet } from '../share/ShareSheet'
import { ShareIcon } from '../ui/ShareIcon'
import type { Position } from '../../lib/types'
import { positionShareText, positionShareUrl } from '../../lib/share'
import { fmtUct, yesProbability } from '../../lib/format'

type Props = {
  position: Position
  trader?: string
  onShared?: () => void
}

export function PositionCard({ position, trader, onShared }: Props) {
  const [shareOpen, setShareOpen] = useState(false)
  const outcome = position.outcome || position.side
  const stake = position.stake_amount ?? position.cost_basis
  const value = position.current_value ?? stake
  const payout = position.potential_payout ?? value
  const pnl = position.unrealized_pnl ?? (value - stake)
  const shareText = positionShareText(position, { trader })
  const shareUrl = positionShareUrl(position.market_id, {
    side: String(outcome),
    stake: Number(stake),
    pnl: Number(pnl),
    value: Number(value),
    by: trader,
  })
  const yes = position.market ? yesProbability(position.market) : 50

  return (
    <>
      <div className="card card-hover card-3d relative p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <Link to={`/markets/${position.market_id}`} className="min-w-0 flex-1 pr-2">
            <p className="line-clamp-2 font-medium leading-snug text-[var(--color-text)]">
              {position.market?.question || 'Market position'}
            </p>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`chip ${outcome === 'YES' ? 'chip-yes' : 'chip-no'}`}>
              {outcome}
            </span>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="btn-ghost share-btn rounded-md p-2"
              aria-label="Share position"
            >
              <ShareIcon />
            </button>
          </div>
        </div>

        <Link to={`/markets/${position.market_id}`} className="block">
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
      </div>

      <ShareSheet
        open={shareOpen}
        title="Share position"
        shareText={shareText}
        shareUrl={shareUrl}
        onClose={() => setShareOpen(false)}
        onCopied={() => onShared?.()}
        preview={{
          headline: position.market?.question || 'Market position',
          description: `${outcome} · Staked ${fmtUct(stake)} · PnL ${pnl >= 0 ? '+' : ''}${fmtUct(pnl)}`,
          badge: outcome,
          imageAccent: outcome === 'YES' ? yes : 100 - yes,
        }}
        card={{
          headline: position.market?.question || 'Market position',
          side: String(outcome),
          stake: Number(stake),
          pnl: Number(pnl),
          trader,
        }}
      />
    </>
  )
}