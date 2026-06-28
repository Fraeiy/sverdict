import { useState } from 'react'
import { MarketCard } from '../components/markets/MarketCard'
import { useMarkets } from '../hooks/useMarkets'

const CATEGORIES = ['all', 'CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER']

export function HomePage() {
  const { markets, loading, load } = useMarkets()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('open')

  function applyFilters(next?: { search?: string; category?: string; status?: string }) {
    const s = next?.search ?? search
    const c = next?.category ?? category
    const st = next?.status ?? status
    load({ search: s || undefined, category: c, status: st, trending: true }).catch(() => {})
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-10">
        <p className="mb-2 text-sm font-medium text-blue-400">Prediction markets on Sphere</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">What do you think happens next?</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Pick a market, choose YES or NO, approve once in Sphere — your position is live instantly.
        </p>
      </section>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <input
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            applyFilters({ search: e.target.value })
          }}
          placeholder="Search markets…"
          className="flex-1 rounded-2xl border border-white/10 bg-[var(--color-surface-2)] px-4 py-3 outline-none transition focus:border-blue-500/50"
        />
        <div className="flex flex-wrap gap-2">
          {['open', 'closed', 'resolved', 'all'].map(s => (
            <button
              key={s}
              onClick={() => { setStatus(s); applyFilters({ status: s }) }}
              className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
                status === s ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => { setCategory(c); applyFilters({ category: c }) }}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              category === c ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-slate-500">
          No markets match your filters
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map(m => <MarketCard key={m.id} market={m} />)}
        </div>
      )}
    </div>
  )
}