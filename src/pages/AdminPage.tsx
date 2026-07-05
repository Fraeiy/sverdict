import { useCallback, useEffect, useState } from 'react'
import { useMarkets } from '../hooks/useMarkets'
import { usePlatform } from '../hooks/usePlatform'
import type { WalletIdentity } from '../lib/types'
import { fmtUct, timeRemaining } from '../lib/format'

const CATEGORIES = ['CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER']

type QueueRow = {
  id: string
  amount: number
  status: string
  created_at: string
  completed_at?: string | null
  tx_reference?: string | null
  failure_reason?: string | null
  users?: { nametag?: string | null; wallet_address?: string }
}

type PendingWithdrawal = {
  id: string
  amount: number
  status: string
  created_at: string
  users?: { nametag?: string | null; wallet_address?: string }
}

const STATUS_CHIP: Record<string, string> = {
  submitted: 'chip-neutral',
  processing: 'chip-gold',
  completed: 'chip-yes',
  failed: 'chip-no',
}

type Props = {
  identity: WalletIdentity | null
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export function AdminPage({ identity, onToast }: Props) {
  const platform = usePlatform(identity)
  const { markets, load } = useMarkets({ autoLoad: true })

  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState('')
  const [category, setCategory] = useState('CRYPTO')
  const [days, setDays] = useState(7)

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<QueueRow[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([])
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    if (!platform.isAdmin) return
    setQueueLoading(true)
    try {
      const { counts: c, recent: r } = await platform.withdrawalQueue()
      setCounts(c || {})
      setRecent((r || []) as QueueRow[])
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load withdrawal queue', 'error')
    } finally {
      setQueueLoading(false)
    }
  }, [platform, onToast])

  const loadPending = useCallback(async () => {
    if (!platform.isAdmin) return
    try {
      const { withdrawals } = await platform.listPendingWithdrawals()
      setPendingWithdrawals((withdrawals || []) as PendingWithdrawal[])
    } catch { /* optional for manual override */ }
  }, [platform])

  useEffect(() => {
    loadQueue().catch(() => {})
    const interval = setInterval(() => loadQueue().catch(() => {}), 30_000)
    return () => clearInterval(interval)
  }, [loadQueue])

  async function createMarket() {
    if (!question.trim()) {
      onToast('Enter a market title', 'error')
      return
    }
    try {
      await platform.createMarket({
        question: question.trim(),
        description: description.trim() || undefined,
        resolutionCriteria: criteria.trim() || undefined,
        category,
        daysOpen: days,
      })
      setQuestion('')
      setDescription('')
      setCriteria('')
      await load({ trending: true })
      onToast('Market created')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to create market', 'error')
    }
  }

  async function fulfillWithdrawal(w: PendingWithdrawal) {
    const recipient = w.users?.nametag || w.users?.wallet_address || 'user'
    const txRef = window.prompt(
      `Emergency manual fulfill: ${fmtUct(w.amount)} to ${recipient}.\n\nPaste Sphere tx reference (or leave blank):`,
    )
    if (txRef === null) return

    setFulfillingId(w.id)
    try {
      await platform.fulfillWithdrawal(w.id, txRef.trim() || undefined)
      await loadQueue()
      await loadPending()
      onToast(`Marked ${fmtUct(w.amount)} withdrawal as sent`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to fulfill withdrawal', 'error')
    } finally {
      setFulfillingId(null)
    }
  }

  async function openManualOverride() {
    setShowManual(v => !v)
    if (!showManual) await loadPending()
  }

  const activeMarkets = markets.filter(m => m.status !== 'resolved')

  if (!platform.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center font-data text-sm text-[var(--color-muted)]">
        Admin access required — connect with the @sphere-predict treasury wallet.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="label-caps mb-2">Operations</p>
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2 text-[var(--color-text-2)]">Create markets, resolve outcomes, monitor treasury withdrawals</p>

      <div className="card mt-8 border-[rgba(245,158,11,0.28)] p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Treasury withdrawal queue</h2>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              GitHub Actions runs the treasury agent every 5 minutes. No manual action needed unless the agent fails.
            </p>
          </div>
          <button
            onClick={() => loadQueue()}
            disabled={queueLoading}
            className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['submitted', 'processing', 'completed', 'failed'] as const).map(status => (
            <div key={status} className="stat-block text-center">
              <p className="label-caps capitalize">{status}</p>
              <p className="mt-1 font-data text-2xl font-bold text-[var(--color-gold)]">
                {counts[status] ?? 0}
              </p>
            </div>
          ))}
        </div>

        {queueLoading && recent.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Loading queue…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No withdrawals yet</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {recent.map(w => {
              const recipient = w.users?.nametag || w.users?.wallet_address || 'Unknown'
              return (
                <div key={w.id} className="card flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{fmtUct(w.amount)}</p>
                      <span className={`chip capitalize ${STATUS_CHIP[w.status] || 'chip-neutral'}`}>
                        {w.status}
                      </span>
                    </div>
                    <p className="mt-1 font-data text-[10px] text-[var(--color-muted)]">
                      To {recipient} · {new Date(w.created_at).toLocaleString()}
                    </p>
                    {w.tx_reference && (
                      <p className="mt-1 truncate font-data text-[9px] text-[var(--color-text-2)]" title={w.tx_reference}>
                        Tx {w.tx_reference}
                      </p>
                    )}
                    {w.failure_reason && (
                      <p className="mt-1 text-xs text-[var(--color-no)]">{w.failure_reason}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={openManualOverride}
          className="mt-4 font-data text-[10px] text-[var(--color-muted)] hover:text-[var(--color-gold)]"
        >
          {showManual ? '▾ Hide manual override' : '▸ Manual override (agent failed)'}
        </button>

        {showManual && (
          <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] p-4">
            <p className="mb-3 text-xs text-[var(--color-text-2)]">
              Only use if you sent UCT manually from @sphere-predict and the agent did not mark the withdrawal complete.
            </p>
            {pendingWithdrawals.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No submitted withdrawals waiting</p>
            ) : (
              <div className="space-y-2">
                {pendingWithdrawals.map(w => {
                  const recipient = w.users?.nametag || w.users?.wallet_address || 'Unknown'
                  return (
                    <div key={w.id} className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{fmtUct(w.amount)} → {recipient}</p>
                      </div>
                      <button
                        onClick={() => fulfillWithdrawal(w)}
                        disabled={fulfillingId === w.id}
                        className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] disabled:opacity-50"
                      >
                        {fulfillingId === w.id ? 'Saving…' : 'Mark sent'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card mt-8 p-6">
        <h2 className="mb-4 font-data text-xs font-bold uppercase tracking-wider">Create market</h2>
        <p className="mb-4 text-sm text-[var(--color-text-2)]">
          Each new market seeds <strong className="text-[var(--color-gold)]">100 UCT</strong> from the @sphere-predict treasury portfolio — 50 YES / 50 NO — so odds start at 50% with real liquidity.
        </p>
        <div className="space-y-4">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Market title / question"
            className="input-pro w-full rounded-lg px-4 py-3 text-sm"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="input-pro min-h-[80px] w-full rounded-lg px-4 py-3 text-sm"
          />
          <textarea
            value={criteria}
            onChange={e => setCriteria(e.target.value)}
            placeholder="Resolution criteria"
            className="input-pro min-h-[80px] w-full rounded-lg px-4 py-3 text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="rounded-xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-2"
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="number"
              min={1}
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="w-24 rounded-xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-2"
            />
            <span className="self-center text-sm text-slate-400">days open</span>
          </div>
          <button
            onClick={createMarket}
            className="btn-gold rounded-lg px-6 py-3 font-data text-xs uppercase tracking-wider"
          >
            Create market
          </button>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Active markets</h2>
        <div className="space-y-3">
          {activeMarkets.map(m => (
            <div key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.question}</p>
                <p className="text-xs text-slate-500">{m.status} · {timeRemaining(m.deadline)}</p>
              </div>
              {m.status === 'open' && (
                <button
                  onClick={() => platform.closeMarket(m.id).then(() => load({ trending: true }))}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                >
                  Close
                </button>
              )}
              <button
                onClick={() => platform.resolveMarket(m.id, 'YES').then(() => { load({ trending: true }); onToast('Resolved YES') })}
                className="chip chip-yes cursor-pointer px-3 py-1.5"
              >
                Resolve YES
              </button>
              <button
                onClick={() => platform.resolveMarket(m.id, 'NO').then(() => { load({ trending: true }); onToast('Resolved NO') })}
                className="chip chip-no cursor-pointer px-3 py-1.5"
              >
                Resolve NO
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}