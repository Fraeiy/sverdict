import { useEffect, useState } from 'react'
import { useMarkets } from '../hooks/useMarkets'
import { usePlatform } from '../hooks/usePlatform'
import type { WalletIdentity } from '../lib/types'
import { fmtUct, timeRemaining } from '../lib/format'

const CATEGORIES = ['CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER']

type PendingWithdrawal = {
  id: string
  amount: number
  status: string
  created_at: string
  users?: { nametag?: string | null; wallet_address?: string }
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
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([])
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false)
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)

  async function loadPendingWithdrawals() {
    if (!platform.isAdmin) return
    setWithdrawalsLoading(true)
    try {
      const { withdrawals } = await platform.listPendingWithdrawals()
      setPendingWithdrawals((withdrawals || []) as PendingWithdrawal[])
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load withdrawals', 'error')
    } finally {
      setWithdrawalsLoading(false)
    }
  }

  useEffect(() => {
    loadPendingWithdrawals().catch(() => {})
  }, [platform.isAdmin])

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
      `Send ${fmtUct(w.amount)} UCT from @sphere-predict to ${recipient}.\n\nPaste the Sphere tx reference after sending (or leave blank):`,
    )
    if (txRef === null) return

    setFulfillingId(w.id)
    try {
      await platform.fulfillWithdrawal(w.id, txRef.trim() || undefined)
      await loadPendingWithdrawals()
      onToast(`Marked ${fmtUct(w.amount)} withdrawal as sent`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to fulfill withdrawal', 'error')
    } finally {
      setFulfillingId(null)
    }
  }

  const activeMarkets = markets.filter(m => m.status !== 'resolved')

  if (!platform.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
        Admin access required — connect with the @sphere-predict treasury wallet.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2 text-slate-400">Create markets, resolve outcomes, and fulfill withdrawals</p>

      <div className="mt-8 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pending withdrawals</h2>
            <p className="mt-1 text-sm text-slate-400">
              Users queue withdrawals from portfolio balance. Send UCT from @sphere-predict, then mark as sent.
            </p>
          </div>
          <button
            onClick={() => loadPendingWithdrawals()}
            disabled={withdrawalsLoading}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {withdrawalsLoading && pendingWithdrawals.length === 0 ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : pendingWithdrawals.length === 0 ? (
          <p className="text-sm text-slate-500">No pending withdrawals</p>
        ) : (
          <div className="space-y-3">
            {pendingWithdrawals.map(w => {
              const recipient = w.users?.nametag || w.users?.wallet_address || 'Unknown user'
              return (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{fmtUct(w.amount)}</p>
                    <p className="text-xs text-slate-500">
                      To {recipient} · {new Date(w.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => fulfillWithdrawal(w)}
                    disabled={fulfillingId === w.id}
                    className="rounded-lg bg-amber-600/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-600/30 disabled:opacity-50"
                  >
                    {fulfillingId === w.id ? 'Saving…' : 'Mark sent'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-[var(--color-surface-2)] p-6">
        <h2 className="mb-4 text-lg font-semibold">Create market</h2>
        <div className="space-y-4">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Market title / question"
            className="w-full rounded-xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-3 outline-none focus:border-blue-500/50"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="min-h-[80px] w-full rounded-xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-3 outline-none focus:border-blue-500/50"
          />
          <textarea
            value={criteria}
            onChange={e => setCriteria(e.target.value)}
            placeholder="Resolution criteria"
            className="min-h-[80px] w-full rounded-xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-3 outline-none focus:border-blue-500/50"
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
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold transition hover:bg-blue-500"
          >
            Create market
          </button>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Active markets</h2>
        <div className="space-y-3">
          {activeMarkets.map(m => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-4">
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
                className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30"
              >
                Resolve YES
              </button>
              <button
                onClick={() => platform.resolveMarket(m.id, 'NO').then(() => { load({ trending: true }); onToast('Resolved NO') })}
                className="rounded-lg bg-rose-600/20 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-600/30"
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