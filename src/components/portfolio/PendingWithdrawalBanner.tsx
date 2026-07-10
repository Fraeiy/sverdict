import type { HistoryEntry } from '../../lib/types'
import { fmtUct } from '../../lib/format'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Queued for treasury agent',
  processing: 'Sending to your Sphere wallet',
}

type Props = {
  pending: HistoryEntry[]
}

export function PendingWithdrawalBanner({ pending }: Props) {
  if (pending.length === 0) return null

  return (
    <div className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="live-dot" />
        <p className="label-caps text-[var(--color-gold)]">
          Pending withdrawal{pending.length > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="space-y-2">
        {pending.map(w => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{fmtUct(w.amount)}</span>
            <span className="font-data text-[10px] text-[var(--color-text-2)]">
              {STATUS_LABEL[String(w.status)] || 'Processing'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-data text-[9px] leading-relaxed text-[var(--color-muted)]">
        Treasury agent runs every ~5 minutes. This page updates automatically when your UCT is sent.
      </p>
    </div>
  )
}