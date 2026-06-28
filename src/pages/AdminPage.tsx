import { useState } from 'react'
import { useMarkets } from '../hooks/useMarkets'
import { usePlatform } from '../hooks/usePlatform'
import type { WalletIdentity } from '../lib/types'
import { timeRemaining } from '../lib/format'

const CATEGORIES = ['CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER']

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

  const activeMarkets = markets.filter(m => m.status !== 'resolved')

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2 text-slate-400">Create and resolve prediction markets</p>

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