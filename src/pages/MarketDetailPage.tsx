import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMarkets } from '../hooks/useMarkets'
import { usePositions } from '../hooks/usePositions'
import type { Market, Outcome } from '../lib/types'
import { fmtUct, noProbability, timeRemaining, yesProbability } from '../lib/format'

type Props = {
  identity: import('../lib/types').WalletIdentity | null
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function MarketDetailPage({ identity, onToast }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getMarket } = useMarkets({ autoLoad: false })
  const { placeTrade, availableBalance, refresh } = usePositions(identity)

  const [market, setMarket] = useState<Market | null>(null)
  const [amount, setAmount] = useState('25')
  const [loading, setLoading] = useState<Outcome | null>(null)

  useEffect(() => {
    if (!id) return
    getMarket(id).then(setMarket).catch(() => onToast('Market not found', 'error'))
  }, [id, getMarket, onToast])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  if (!market) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-slate-400">Loading market…</p>
      </div>
    )
  }

  const yes = yesProbability(market)
  const no = noProbability(market)
  const isOpen = market.status === 'open' && new Date(market.deadline) > new Date()
  const stakeAmount = parseFloat(amount) || 0
  const insufficient = stakeAmount > availableBalance

  async function handleBuy(outcome: Outcome) {
    if (!stakeAmount || stakeAmount <= 0) {
      onToast('Enter a valid stake amount', 'error')
      return
    }
    if (insufficient) {
      onToast('Insufficient portfolio balance — deposit first', 'error')
      return
    }
    if (!isOpen) {
      onToast('This market is not open for trading', 'error')
      return
    }

    setLoading(outcome)
    try {
      await placeTrade({ marketId: market!.id, outcome, amount: stakeAmount })
      onToast(`Bought ${outcome} for ${fmtUct(stakeAmount)}`, 'success')
      navigate('/portfolio?tab=positions')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Trade failed', 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="mb-6 inline-flex text-sm text-slate-400 transition hover:text-white">
        ← Back to markets
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">{market.category}</span>
        <span className={`rounded-full px-3 py-1 font-medium ${
          market.status === 'open' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
        }`}>
          {market.status}
        </span>
        <span className="text-slate-500">{timeRemaining(market.deadline)}</span>
      </div>

      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{market.question}</h1>

      {market.description && (
        <p className="mt-4 leading-relaxed text-slate-300">{market.description}</p>
      )}

      {market.resolution_criteria && (
        <div className="mt-6 rounded-2xl border border-white/8 bg-white/5 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Resolution criteria</p>
          <p className="text-sm text-slate-300">{market.resolution_criteria}</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
          <p className="text-sm text-emerald-400">YES probability</p>
          <p className="mt-1 text-4xl font-bold text-emerald-400">{yes}%</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-center">
          <p className="text-sm text-rose-400">NO probability</p>
          <p className="mt-1 text-4xl font-bold text-rose-400">{no}%</p>
        </div>
      </div>

      <div className="mt-4 flex justify-between text-sm text-slate-400">
        <span>Volume {fmtUct(market.volume || 0)}</span>
        <span>Closes {new Date(market.deadline).toLocaleDateString()}</span>
      </div>

      {isOpen ? (
        <div className="mt-8 rounded-3xl border border-white/10 bg-[var(--color-surface-2)] p-6">
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-slate-400">Portfolio balance</span>
            <span className="font-semibold">{fmtUct(availableBalance)}</span>
          </div>

          {availableBalance <= 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Deposit funds to your portfolio before trading.{' '}
              <Link to="/portfolio" className="font-medium underline">Go to Portfolio →</Link>
            </div>
          )}

          <label className="mb-2 block text-sm font-medium text-slate-400">Stake amount (UCT)</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="mb-4 w-full rounded-2xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-4 text-xl font-semibold outline-none focus:border-blue-500/50"
          />
          <div className="mb-6 flex flex-wrap gap-2">
            {[10, 25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => setAmount(String(n))}
                disabled={n > availableBalance}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm transition hover:bg-white/5 disabled:opacity-30"
              >
                {n} UCT
              </button>
            ))}
          </div>

          {insufficient && stakeAmount > 0 && (
            <p className="mb-4 text-sm text-rose-400">Amount exceeds portfolio balance</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleBuy('YES')}
              disabled={!!loading || insufficient || availableBalance <= 0}
              className="rounded-2xl bg-emerald-600 py-4 text-lg font-bold transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading === 'YES' ? 'Placing…' : 'Buy YES'}
            </button>
            <button
              onClick={() => handleBuy('NO')}
              disabled={!!loading || insufficient || availableBalance <= 0}
              className="rounded-2xl bg-rose-600 py-4 text-lg font-bold transition hover:bg-rose-500 disabled:opacity-50"
            >
              {loading === 'NO' ? 'Placing…' : 'Buy NO'}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            Trades use your portfolio margin — instant, no wallet popup per trade.
          </p>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-lg font-medium">
            {market.status === 'resolved'
              ? `Resolved: ${market.resolution || market.resolved_outcome}`
              : 'This market is closed'}
          </p>
          <Link to="/portfolio" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
            View your portfolio →
          </Link>
        </div>
      )}
    </div>
  )
}