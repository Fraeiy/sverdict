import type { Outcome } from '../../lib/types'
import { fmtUct } from '../../lib/format'

type Props = {
  open: boolean
  question: string
  outcome: Outcome
  amount: number
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function TradeConfirmModal({
  open,
  question,
  outcome,
  amount,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  const isYes = outcome === 'YES'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-confirm-title"
      onClick={onCancel}
    >
      <div
        className="card card-glow w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="label-caps mb-2">Confirm trade</p>
        <h2 id="trade-confirm-title" className="text-lg font-bold leading-snug">
          Buy {outcome}?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-2)]">{question}</p>

        <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] p-4">
          <div className="flex items-center justify-between font-data text-[11px]">
            <span className="text-[var(--color-muted)]">Side</span>
            <span className={`font-bold ${isYes ? 'text-[var(--color-gold-bright)]' : 'text-[var(--color-no)]'}`}>
              {outcome}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between font-data text-[11px]">
            <span className="text-[var(--color-muted)]">Stake</span>
            <span className="font-bold text-[var(--color-gold)]">{fmtUct(amount)}</span>
          </div>
        </div>

        <p className="mt-4 text-center font-data text-[9px] text-[var(--color-muted)]">
          This uses portfolio margin instantly — double-check before confirming
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-ghost rounded-lg py-3 font-data text-xs font-bold uppercase tracking-wider disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg py-3 font-data text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${
              isYes
                ? 'border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.2)] text-[var(--color-gold-bright)] hover:bg-[rgba(251,191,36,0.3)]'
                : 'border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.15)] text-[var(--color-no)] hover:bg-[rgba(248,113,113,0.25)]'
            }`}
          >
            {loading ? 'Placing…' : `Confirm ${outcome}`}
          </button>
        </div>
      </div>
    </div>
  )
}