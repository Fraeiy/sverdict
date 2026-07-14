import { useState } from 'react'
import { BRAND_LOGO, BRAND_NAME } from '../../lib/brand'
import { copyToClipboard, nativeShare } from '../../lib/share'
import { fmtUct } from '../../lib/format'

type Props = {
  open: boolean
  title: string
  shareText: string
  shareUrl: string
  onClose: () => void
  onCopied?: () => void
  card?: {
    headline: string
    subline?: string
    side?: string
    stake?: number
    value?: number
    pnl?: number
    trader?: string
  }
}

export function ShareSheet({ open, title, shareText, shareUrl, onClose, onCopied, card }: Props) {
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function handleCopy() {
    setBusy(true)
    try {
      await copyToClipboard(shareText)
      onCopied?.()
    } finally {
      setBusy(false)
    }
  }

  async function handleNativeShare() {
    setBusy(true)
    try {
      const shared = await nativeShare({ title, text: shareText, url: shareUrl })
      if (!shared) await handleCopy()
    } finally {
      setBusy(false)
    }
  }

  const pnl = card?.pnl ?? 0

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-data text-xs font-bold uppercase tracking-wider text-[var(--color-gold)]">{title}</p>
          <button type="button" onClick={onClose} className="btn-ghost rounded-md px-2 py-1 font-data text-[10px]">
            Close
          </button>
        </div>

        {card && (
          <div className="card mb-4 overflow-hidden border-[rgba(245,158,11,0.28)] p-0">
            <div className="border-b border-[var(--color-border)] bg-[rgba(245,158,11,0.08)] px-4 py-3">
              <div className="flex items-center gap-2">
                <img src={BRAND_LOGO} alt="" className="h-5 w-5 rounded object-cover" aria-hidden />
                <p className="font-data text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-gold)]">
                  {BRAND_NAME}
                </p>
              </div>
              {card.trader && (
                <p className="mt-1 font-data text-[10px] text-[var(--color-muted)]">@{card.trader.replace(/^@/, '')}</p>
              )}
            </div>
            <div className="p-4">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{card.headline}</p>
              {card.subline && (
                <p className="mt-2 font-data text-[10px] text-[var(--color-muted)]">{card.subline}</p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-3">
                {card.side && (
                  <div>
                    <p className="label-caps">Side</p>
                    <p className={`mt-1 font-data text-sm font-bold ${card.side === 'YES' ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}`}>
                      {card.side}
                    </p>
                  </div>
                )}
                {card.stake != null && (
                  <div>
                    <p className="label-caps">Staked</p>
                    <p className="mt-1 font-data text-sm font-bold">{fmtUct(card.stake)}</p>
                  </div>
                )}
                {card.pnl != null && (
                  <div>
                    <p className="label-caps">PnL</p>
                    <p className={`mt-1 font-data text-sm font-bold ${pnl >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}`}>
                      {pnl >= 0 ? '+' : ''}{fmtUct(pnl)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mb-4 break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] px-3 py-2 font-data text-[10px] text-[var(--color-text-2)]">
          {shareUrl}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleCopy}
            className="btn-ghost rounded-lg py-3 font-data text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
          >
            Copy link
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleNativeShare}
            className="btn-gold rounded-lg py-3 font-data text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}