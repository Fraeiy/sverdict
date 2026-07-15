import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShareSheet } from '../share/ShareSheet'
import { ShareIcon } from '../ui/ShareIcon'
import type { Position } from '../../lib/types'
import { positionShareUrl, resolvedPositionShareText } from '../../lib/share'
import { fmtUct, realizedPnl, yesProbability } from '../../lib/format'

type Props = {
  position: Position
  trader?: string
  onShared?: () => void
}

export function ResolvedPositionCard({ position, trader, onShared }: Props) {
  const [shareOpen, setShareOpen] = useState(false)
  const outcome = position.outcome || position.side
  const stake = Number(position.stake_amount ?? position.cost_basis ?? 0)
  const payout = Number(position.payout ?? 0)
  const net = realizedPnl(position)
  const won = payout > 0
  const shareText = resolvedPositionShareText(position, net, { trader })
  const shareUrl = positionShareUrl(position.market_id, {
    side: String(outcome),
    stake,
    pnl: net,
    value: payout,
    by: trader,
    resolved: true,
  })
  const yes = position.market ? yesProbability(position.market) : 50

  return (
    <>
      <div className="card card-hover relative p-5 opacity-90">
        <div className="flex items-center justify-between gap-3">
          <Link to={`/markets/${position.market_id}`} className="min-w-0 flex-1">
            <p className="font-medium">{position.market?.question || position.market_id}</p>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`chip ${outcome === 'YES' ? 'chip-yes' : 'chip-no'}`}>
              {outcome}
            </span>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="btn-ghost share-btn rounded-md p-2"
              aria-label="Share result"
            >
              <ShareIcon />
            </button>
          </div>
        </div>
        <Link to={`/markets/${position.market_id}`} className="block">
          <div className="mt-3 flex flex-wrap gap-6 font-data text-[11px] text-[var(--color-text-2)]">
            <span>Staked <span className="text-[var(--color-text)]">{fmtUct(stake)}</span></span>
            {won && (
              <span>Payout <span className="text-[var(--color-gold)]">{fmtUct(payout)}</span></span>
            )}
            <span className={net >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}>
              Net PnL {net >= 0 ? '+' : ''}{fmtUct(net)}
            </span>
          </div>
          {won && net === 0 && (
            <p className="mt-2 font-data text-[10px] text-[var(--color-muted)]">
              Outcome won — returned stake (no opposing pool liquidity).
            </p>
          )}
        </Link>
      </div>

      <ShareSheet
        open={shareOpen}
        title="Share result"
        shareText={shareText}
        shareUrl={shareUrl}
        onClose={() => setShareOpen(false)}
        onCopied={() => onShared?.()}
        preview={{
          headline: position.market?.question || 'Resolved position',
          description: `${outcome} · Staked ${fmtUct(stake)} · Realized ${net >= 0 ? '+' : ''}${fmtUct(net)}`,
          badge: outcome,
          imageAccent: outcome === 'YES' ? yes : 100 - yes,
        }}
        card={{
          headline: position.market?.question || 'Resolved position',
          side: String(outcome),
          stake,
          value: payout,
          pnl: net,
          trader,
          resolved: true,
        }}
      />
    </>
  )
}