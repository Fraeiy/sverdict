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

  const openCount = markets.filter(m => m.status === 'open').length

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="chip chip-gold">Live markets</span>
          <span className="flex items-center gap-2 font-data text-[10px] text-[var(--color-muted)]">
            <span className="live-dot" />
            {openCount} open · Sphere testnet
          </span>
        </div>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
          Agentic prediction markets at{' '}
          <span className="text-[var(--color-gold)]">machine speed</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--color-text-2)]">
          Stake UCT on real outcomes. Portfolio margin, instant execution, cryptographic settlement on Unicity Sphere.
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
          className="input-pro flex-1 rounded-lg px-4 py-3 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {['open', 'closed', 'resolved', 'all'].map(s => (
            <button
              key={s}
              onClick={() => { setStatus(s); applyFilters({ status: s }) }}
              className={`chip capitalize transition ${
                status === s ? 'chip-gold' : 'chip-neutral hover:border-[rgba(212,168,67,0.3)]'
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
            className={`rounded-full px-4 py-1.5 font-data text-[10px] font-bold uppercase tracking-wider transition ${
              category === c
                ? 'bg-[var(--color-gold)] text-[#0a0a08]'
                : 'border border-[var(--color-border)] text-[var(--color-text-2)] hover:border-[rgba(212,168,67,0.35)] hover:text-[var(--color-gold)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-52 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-3)]" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="card rounded-xl border-dashed py-16 text-center font-data text-sm text-[var(--color-muted)]">
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