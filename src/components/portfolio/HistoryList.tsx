import type { HistoryEntry } from '../../lib/types'
import { fmtUct } from '../../lib/format'

const TYPE_STYLES: Record<string, string> = {
  deposit: 'bg-blue-500/15 text-blue-400',
  withdrawal: 'bg-amber-500/15 text-amber-400',
  trade: 'bg-purple-500/15 text-purple-400',
  settlement: 'bg-emerald-500/15 text-emerald-400',
}

export function HistoryList({ entries, loading }: { entries: HistoryEntry[]; loading?: boolean }) {
  if (loading) {
    return <p className="py-12 text-center text-slate-500">Loading history…</p>
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-slate-500">
        No activity yet — deposits, withdrawals, and trades will show here
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <div
          key={entry.id}
          className="flex items-center gap-4 rounded-2xl border border-white/8 bg-[var(--color-surface-2)] px-5 py-4"
        >
          <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${TYPE_STYLES[entry.type] || 'bg-white/10 text-slate-300'}`}>
            {entry.type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{entry.label}</p>
            {entry.detail && (
              <p className="truncate text-sm text-slate-500">{entry.detail}</p>
            )}
          </div>
          <div className="text-right">
            <p className={`font-semibold ${entry.direction === 'in' ? 'text-emerald-400' : 'text-slate-200'}`}>
              {entry.direction === 'in' ? '+' : '−'}{fmtUct(entry.amount)}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(entry.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}