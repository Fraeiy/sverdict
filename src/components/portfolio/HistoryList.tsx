import type { HistoryEntry } from '../../lib/types'
import { fmtUct } from '../../lib/format'

const TYPE_STYLES: Record<string, string> = {
  deposit: 'chip-gold',
  withdrawal: 'chip-neutral',
  trade: 'chip-neutral',
  settlement: 'chip-yes',
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
      {entries.map(entry => (
        <div
          key={entry.id}
          className="card flex items-center gap-4 px-5 py-4"
        >
          <span className={`chip shrink-0 capitalize ${TYPE_STYLES[entry.type] || 'chip-neutral'}`}>
            {entry.type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--color-text)]">{entry.label}</p>
            {entry.detail && (
              <p className="truncate font-data text-[10px] text-[var(--color-muted)]">{entry.detail}</p>
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
      ))}
    </div>
  )
}