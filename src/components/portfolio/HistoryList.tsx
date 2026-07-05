import type { HistoryEntry } from '../../lib/types'
import { fmtUct } from '../../lib/format'

const TYPE_STYLES: Record<string, string> = {
  deposit: 'chip-gold',
  withdrawal: 'chip-neutral',
  trade: 'chip-neutral',
  settlement: 'chip-yes',
}

const WITHDRAWAL_STATUS_STYLES: Record<string, string> = {
  submitted: 'chip-neutral',
  processing: 'chip-gold',
  completed: 'chip-yes',
  failed: 'chip-no',
}

const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  submitted: 'Queued',
  processing: 'Sending',
  completed: 'Sent',
  failed: 'Failed',
}

function truncateRef(ref: string, head = 12, tail = 8) {
  if (ref.length <= head + tail + 3) return ref
  return `${ref.slice(0, head)}…${ref.slice(-tail)}`
}

function withdrawalDetail(entry: HistoryEntry) {
  if (entry.type !== 'withdrawal') return entry.detail
  const parts: string[] = []
  if (entry.status === 'completed' && entry.tx_reference) {
    parts.push(`Tx ${truncateRef(entry.tx_reference)}`)
  } else if (entry.status === 'failed' && entry.detail && !entry.detail.startsWith('SP:v1:')) {
    parts.push(entry.detail)
  } else if (entry.status === 'submitted' || entry.status === 'processing') {
    parts.push(entry.detail || 'Treasury agent will send on-chain')
  } else if (entry.detail && !entry.detail.startsWith('SP:v1:')) {
    parts.push(entry.detail)
  }
  if (entry.detail?.startsWith('SP:v1:')) {
    parts.push(entry.detail)
  }
  return parts.filter(Boolean).join(' · ') || entry.detail
}

export function HistoryList({ entries, loading }: { entries: HistoryEntry[]; loading?: boolean }) {
  if (loading) {
    return <p className="py-12 text-center font-data text-sm text-[var(--color-muted)]">Loading history…</p>
  }

  if (entries.length === 0) {
    return (
      <div className="card rounded-xl border-dashed py-12 text-center font-data text-sm text-[var(--color-muted)]">
        No activity yet — deposits, withdrawals, and trades will show here
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map(entry => {
        const detail = withdrawalDetail(entry)
        const status = entry.type === 'withdrawal' && entry.status ? String(entry.status) : null
        return (
          <div
            key={entry.id}
            className="card flex items-center gap-4 px-5 py-4"
          >
            <div className="flex shrink-0 flex-col items-start gap-1.5">
              <span className={`chip capitalize ${TYPE_STYLES[entry.type] || 'chip-neutral'}`}>
                {entry.type}
              </span>
              {status && (
                <span className={`chip text-[9px] ${WITHDRAWAL_STATUS_STYLES[status] || 'chip-neutral'}`}>
                  {WITHDRAWAL_STATUS_LABELS[status] || status}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--color-text)]">{entry.label}</p>
              {detail && (
                <p className="truncate font-data text-[10px] text-[var(--color-muted)]" title={detail}>
                  {detail}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`font-data text-sm font-bold ${
                entry.direction === 'in' ? 'text-[var(--color-yes)]' : 'text-[var(--color-text)]'
              }`}>
                {entry.direction === 'in' ? '+' : '−'}{fmtUct(entry.amount)}
              </p>
              <p className="font-data text-[9px] text-[var(--color-muted)]">
                {new Date(entry.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}