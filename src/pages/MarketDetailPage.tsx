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
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-gold)] border-t-transparent" />
        <p className="font-data text-sm text-[var(--color-muted)]">Loading market…</p>
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
      <Link to="/" className="mb-6 inline-flex font-data text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-gold)]">
        ← MARKETS
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="chip chip-neutral">{market.category}</span>
        <span className={`chip ${market.status === 'open' ? 'chip-open' : 'chip-gold'}`}>
          {market.status}
        </span>
        <span className="font-data text-[10px] text-[var(--color-muted)]">{timeRemaining(market.deadline)}</span>
      </div>

      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{market.question}</h1>

      {market.description && (
        <p className="mt-4 leading-relaxed text-[var(--color-text-2)]">{market.description}</p>
      )}

      {market.resolution_criteria && (
        <div className="card mt-6 p-4">
          <p className="label-caps mb-2">Resolution criteria</p>
          <p className="text-sm text-[var(--color-text-2)]">{market.resolution_criteria}</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="stat-block border-[rgba(80,200,120,0.2)] text-center">
          <p className="label-caps text-[var(--color-yes)]">YES probability</p>
          <p className="mt-2 font-data text-4xl font-bold text-[var(--color-yes)]">{yes}%</p>
        </div>
        <div className="stat-block border-[rgba(232,93,111,0.2)] text-center">
          <p className="label-caps text-[var(--color-no)]">NO probability</p>
          <p className="mt-2 font-data text-4xl font-bold text-[var(--color-no)]">{no}%</p>
        </div>
      </div>

      <div className="odds-track mt-4">
        <div className="odds-fill" style={{ width: `${yes}%` }} />
      </div>

      <div className="mt-3 flex justify-between font-data text-[10px] text-[var(--color-muted)]">
        <span>VOL <span className="text-[var(--color-gold)]">{fmtUct(market.volume || 0)}</span></span>
        <span>Closes {new Date(market.deadline).toLocaleDateString()}</span>
      </div>

      {isOpen ? (
        <div className="card card-glow mt-8 p-6">
          <p className="label-caps mb-4">Execute position</p>

          <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] px-4 py-3 font-data text-[11px]">
            <span className="text-[var(--color-muted)]">Portfolio margin</span>
            <span className="font-bold text-[var(--color-gold)]">{fmtUct(availableBalance)}</span>
          </div>

          {availableBalance <= 0 && (
            <div className="mb-4 rounded-lg border border-[rgba(212,168,67,0.3)] bg-[rgba(212,168,67,0.08)] px-4 py-3 text-sm text-[var(--color-gold-bright)]">
              Deposit funds before trading.{' '}
              <Link to="/portfolio" className="font-bold underline">Portfolio →</Link>
            </div>
          )}

          <label className="label-caps mb-2 block">Stake amount (UCT)</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="input-pro mb-4 w-full rounded-lg px-4 py-4 text-xl font-bold"
          />
          <div className="mb-6 flex flex-wrap gap-2">
            {[10, 25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => setAmount(String(n))}
                disabled={n > availableBalance}
                className="btn-ghost rounded-md px-4 py-2 font-data text-[10px] disabled:opacity-30"
              >
                {n} UCT
              </button>
            ))}
          </div>

          {insufficient && stakeAmount > 0 && (
            <p className="mb-4 font-data text-xs text-[var(--color-no)]">Amount exceeds portfolio balance</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleBuy('YES')}
              disabled={!!loading || insufficient || availableBalance <= 0}
              className="rounded-lg border border-[rgba(80,200,120,0.35)] bg-[rgba(80,200,120,0.12)] py-4 font-data text-sm font-bold uppercase tracking-wider text-[var(--color-yes)] transition hover:bg-[rgba(80,200,120,0.2)] disabled:opacity-40"
            >
              {loading === 'YES' ? 'Placing…' : 'Buy YES'}
            </button>
            <button
              onClick={() => handleBuy('NO')}
              disabled={!!loading || insufficient || availableBalance <= 0}
              className="rounded-lg border border-[rgba(232,93,111,0.35)] bg-[rgba(232,93,111,0.12)] py-4 font-data text-sm font-bold uppercase tracking-wider text-[var(--color-no)] transition hover:bg-[rgba(232,93,111,0.2)] disabled:opacity-40"
            >
              {loading === 'NO' ? 'Placing…' : 'Buy NO'}
            </button>
          </div>

          <p className="mt-4 text-center font-data text-[9px] text-[var(--color-muted)]">
            Instant execution from portfolio margin — no per-trade wallet popup
          </p>
        </div>
      ) : (
        <div className="card mt-8 p-8 text-center">
          <p className="text-lg font-medium">
            {market.status === 'resolved'
              ? `Resolved: ${market.resolution || market.resolved_outcome}`
              : 'This market is closed'}
          </p>
          <Link to="/portfolio" className="mt-4 inline-block font-data text-[11px] text-[var(--color-gold)] hover:underline">
            VIEW PORTFOLIO →
          </Link>
        </div>
      )}
    </div>
  )
}