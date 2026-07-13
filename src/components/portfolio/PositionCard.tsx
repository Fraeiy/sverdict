import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShareSheet } from '../share/ShareSheet'
import type { Position } from '../../lib/types'
import { positionShareText, positionShareUrl } from '../../lib/share'
import { fmtUct } from '../../lib/format'

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

  return (
    <>
      <div className="card card-hover relative p-5">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="btn-ghost absolute right-3 top-3 rounded-md px-2 py-1 font-data text-[9px] font-bold uppercase tracking-wider"
        >
          Share
        </button>

        <Link to={`/markets/${position.market_id}`} className="block pr-16">
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
      </div>

      <ShareSheet
        open={shareOpen}
        title="Share position"
        shareText={shareText}
        shareUrl={shareUrl}
        onClose={() => setShareOpen(false)}
        onCopied={() => onShared?.()}
        card={{
          headline: position.market?.question || 'Market position',
          subline: `${outcome} position`,
          side: String(outcome),
          stake: Number(stake),
          value: Number(value),
          pnl: Number(pnl),
          trader,
        }}
      />
    </>
  )
}