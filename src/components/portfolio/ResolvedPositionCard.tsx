import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShareSheet } from '../share/ShareSheet'
import { ShareIcon } from '../ui/ShareIcon'
import type { Position } from '../../lib/types'
import { positionShareUrl, resolvedPositionShareText } from '../../lib/share'
import { fmtUct, realizedPnl, yesProbability } from '../../lib/format'
import { pnlMemeFor } from '../../lib/pnlMeme'

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
  const meme = pnlMemeFor(net, stake, { resolved: true, wonOutcome: won })
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
      <div className="card card-hover relative p-5 opacity-95">
        <div className="mb-3 flex items-start justify-between gap-2">
          <Link to={`/markets/${position.market_id}`} className="min-w-0 flex-1 pr-2">
            <p className="line-clamp-2 font-medium leading-snug text-[var(--color-text)]">
              {position.market?.question || 'Resolved position'}
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
              aria-label="Share result"
            >
              <ShareIcon />
            </button>
          </div>
        </div>

        <div
          className={`mb-3 flex items-center gap-3 rounded-lg border px-3 py-2 ${
            net > 0
              ? 'border-[rgba(74,222,128,0.35)] bg-[rgba(74,222,128,0.08)]'
              : net < 0
                ? 'border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-4)]'
          }`}
        >
          <span className="text-2xl leading-none" aria-hidden>{meme.emoji}</span>
          <div className="min-w-0">
            <p className="font-data text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
              {meme.label} · {meme.caption}
            </p>
            <p className={`font-data text-sm font-bold ${net >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}`}>
              {net >= 0 ? '+' : ''}{fmtUct(net)} realized
            </p>
          </div>
        </div>

        <Link to={`/markets/${position.market_id}`} className="block">
          <div className="grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-3">
            <div>
              <p className="label-caps">Staked</p>
              <p className="mt-1 font-data text-sm font-bold">{fmtUct(stake)}</p>
            </div>
            <div>
              <p className="label-caps">Payout</p>
              <p className="mt-1 font-data text-sm font-bold text-[var(--color-gold)]">{fmtUct(payout)}</p>
            </div>
            <div>
              <p className="label-caps">Net PnL</p>
              <p className={`mt-1 font-data text-sm font-bold ${net >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}`}>
                {net >= 0 ? '+' : ''}{fmtUct(net)}
              </p>
            </div>
          </div>

          {won && net === 0 && (
            <p className="mt-3 font-data text-[10px] text-[var(--color-muted)]">
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
          description: `${meme.emoji} ${meme.caption} · ${outcome} · Realized ${net >= 0 ? '+' : ''}${fmtUct(net)}`,
          badge: meme.label,
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
          meme,
        }}
      />
    </>
  )
}