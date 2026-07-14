import { useEffect, useState } from 'react'
import { BRAND_LOGO, BRAND_NAME } from '../../lib/brand'
import { fmtUct } from '../../lib/format'
import { copyToClipboard, nativeShare, shareLinkLabel } from '../../lib/share'

type Props = {
  open: boolean
  title: string
  shareText: string
  shareUrl: string
  onClose: () => void
  onCopied?: () => void
  preview?: {
    headline: string
    description?: string
    badge?: string
    imageAccent?: number
  }
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

export function ShareSheet({ open, title, shareText, shareUrl, onClose, onCopied, preview, card }: Props) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  if (!open) return null

  const linkLabel = shareLinkLabel(shareUrl)
  const accent = preview?.imageAccent ?? 50

  async function handleCopy() {
    setBusy(true)
    try {
      await copyToClipboard(shareUrl)
      setCopied(true)
      onCopied?.()
      setTimeout(() => setCopied(false), 2500)
    } finally {
      setBusy(false)
    }
  }

  async function handleNativeShare() {
    setBusy(true)
    try {
      const shared = await nativeShare({
        title: preview?.headline || title,
        text: shareText.split('\n').slice(0, 2).join('\n'),
        url: shareUrl,
      })
      if (!shared) await handleCopy()
    } finally {
      setBusy(false)
    }
  }

  const pnl = card?.pnl ?? 0

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="sheet-3d w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-data text-xs font-bold uppercase tracking-wider text-[var(--color-gold)]">{title}</p>
          <button type="button" onClick={onClose} className="btn-ghost rounded-md px-2 py-1 font-data text-[10px]">
            Close
          </button>
        </div>

        {(preview || card) && (
          <div className="link-preview mb-4">
            <div className="link-preview-media">
              <img src={BRAND_LOGO} alt="" className="link-preview-logo" />
              {preview?.badge && (
                <span className="link-preview-badge">{preview.badge}</span>
              )}
              <div className="link-preview-accent" style={{ width: `${Math.min(100, Math.max(0, accent))}%` }} />
            </div>
            <div className="link-preview-body">
              <p className="link-preview-domain">{linkLabel.split('/')[0]}</p>
              <p className="link-preview-title">{preview?.headline || card?.headline}</p>
              <p className="link-preview-desc">
                {preview?.description || card?.subline || `${BRAND_NAME} · Sphere prediction market`}
              </p>
            </div>
          </div>
        )}

        {card && (card.side || card.stake != null || card.pnl != null) && (
          <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] p-3">
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
        )}

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[rgba(245,158,11,0.25)] bg-[var(--color-surface-4)] px-3 py-2.5">
          <span className={`shrink-0 font-data text-[10px] font-bold ${copied ? 'text-[var(--color-yes)]' : 'text-[var(--color-muted)]'}`}>
            {copied ? '✓' : '⎘'}
          </span>
          <p className="truncate font-data text-[11px] text-[var(--color-gold)]">{linkLabel}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleCopy}
            className={`rounded-lg py-3 font-data text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 ${
              copied
                ? 'border border-[rgba(74,222,128,0.45)] bg-[rgba(74,222,128,0.12)] text-[var(--color-yes)]'
                : 'btn-ghost'
            }`}
          >
            {copied ? 'Copied!' : 'Copy link'}
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