import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SharedPositionBanner } from '../components/share/SharedPositionBanner'
import { ShareSheet } from '../components/share/ShareSheet'
import { TradeConfirmModal } from '../components/ui/TradeConfirmModal'
import { useMarket } from '../hooks/useMarket'
import { usePositions } from '../hooks/usePositions'
import { useUserSettings } from '../hooks/useUserSettings'
import type { Outcome } from '../lib/types'
import { loadCachedPreferences } from '../lib/userSettings'
import { marketShareText, marketShareUrl, parsePositionShareParams } from '../lib/share'
import { fmtUct, noProbability, timeRemaining, yesProbability } from '../lib/format'

type Props = {
  identity: import('../lib/types').WalletIdentity | null
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function MarketDetailPage({ identity, onToast }: Props) {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { market, loading: marketLoading, error: marketError, oddsUpdated, isLive } = useMarket(id)
  const { placeTrade, availableBalance, refresh } = usePositions(identity)
  const { preferences } = useUserSettings(identity)

  const [amount, setAmount] = useState(() => String(loadCachedPreferences().defaultStake))
  const [loading, setLoading] = useState<Outcome | null>(null)
  const [confirmOutcome, setConfirmOutcome] = useState<Outcome | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const stakeInitialized = useRef(false)
  const sharedPosition = useMemo(() => parsePositionShareParams(searchParams), [searchParams])

  useEffect(() => {
    if (marketError) onToast('Market not found', 'error')
  }, [marketError, onToast])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    if (!stakeInitialized.current) {
      setAmount(String(preferences.defaultStake))
      stakeInitialized.current = true
    }
  }, [preferences.defaultStake])

  if (marketLoading || !market) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-gold)] border-t-transparent" />
        <p className="font-data text-sm text-[var(--color-muted)]">Loading market…</p>
      </div>
    )
  }

  const yes = yesProbability(market)
  const no = noProbability(market)
  const seeding = market.seed_status === 'pending' || market.seed_status === 'processing' || market.status === 'pending_seed'
  const isOpen = market.status === 'open' && !seeding && new Date(market.deadline) > new Date()
  const stakeAmount = parseFloat(amount) || 0
  const insufficient = stakeAmount > availableBalance

  function requestBuy(outcome: Outcome) {
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
    if (preferences.confirmBeforeTrade) {
      setConfirmOutcome(outcome)
      return
    }
    executeBuy(outcome)
  }

  async function executeBuy(outcome: Outcome) {
    if (!market) return
    setLoading(outcome)
    try {
      await placeTrade({ marketId: market.id, outcome, amount: stakeAmount })
      setConfirmOutcome(null)
      onToast(`Bought ${outcome} for ${fmtUct(stakeAmount)}`, 'success')
      navigate('/portfolio?tab=positions')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Trade failed', 'error')
    } finally {
      setLoading(null)
    }
  }

  async function confirmBuy() {
    if (!confirmOutcome) return
    await executeBuy(confirmOutcome)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex font-data text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-gold)]">
          ← MARKETS
        </Link>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] font-bold uppercase tracking-wider"
        >
          Share market
        </button>
      </div>

      {sharedPosition && (
        <SharedPositionBanner params={sharedPosition} question={market.question} />
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="chip chip-neutral">{market.category}</span>
        <span className={`chip ${isOpen ? 'chip-open' : seeding ? 'chip-gold' : 'chip-neutral'}`}>
          {seeding ? 'seeding' : market.status}
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

      <div className="mt-8 flex items-center justify-between gap-3">
        <p className="label-caps">Live odds</p>
        {isLive && (
          <span className={`flex items-center gap-1.5 font-data text-[9px] uppercase tracking-wider ${
            oddsUpdated ? 'text-[var(--color-gold-bright)]' : 'text-[var(--color-muted)]'
          }`}>
            <span className="live-dot" />
            {oddsUpdated ? 'Updated' : 'Live'}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className={`stat-block border-[rgba(251,191,36,0.25)] text-center transition ${
          oddsUpdated ? 'ring-1 ring-[rgba(251,191,36,0.45)]' : ''
        }`}>
          <p className="label-caps text-[var(--color-gold-bright)]">YES probability</p>
          <p className="mt-2 font-data text-4xl font-bold text-[var(--color-gold-bright)]">{yes}%</p>
          <p className="mt-2 font-data text-[10px] text-[var(--color-muted)]">
            Pool {fmtUct(market.yes_pool || 0)}
          </p>
        </div>
        <div className={`stat-block border-[rgba(248,113,113,0.25)] text-center transition ${
          oddsUpdated ? 'ring-1 ring-[rgba(248,113,113,0.35)]' : ''
        }`}>
          <p className="label-caps text-[var(--color-no)]">NO probability</p>
          <p className="mt-2 font-data text-4xl font-bold text-[var(--color-no)]">{no}%</p>
          <p className="mt-2 font-data text-[10px] text-[var(--color-muted)]">
            Pool {fmtUct(market.no_pool || 0)}
          </p>
        </div>
      </div>

      <div className="odds-track mt-4">
        <div className="odds-fill" style={{ width: `${yes}%` }} />
      </div>

      <div className="mt-3 flex justify-between font-data text-[10px] text-[var(--color-muted)]">
        <span>VOL <span className="text-[var(--color-gold)]">{fmtUct(market.volume || 0)}</span></span>
        <span>Liquidity <span className="text-[var(--color-text-2)]">{fmtUct((market.yes_pool || 0) + (market.no_pool || 0))}</span></span>
        <span>Closes {new Date(market.deadline).toLocaleDateString()}</span>
      </div>

      {seeding ? (
        <div className="card mt-8 border-[rgba(245,158,11,0.35)] p-6 text-center">
          <p className="font-data text-xs uppercase tracking-wider text-[var(--color-gold)]">Liquidity seeding</p>
          <p className="mt-2 text-sm text-[var(--color-text-2)]">
            Treasury is sending on-chain UCT to open this market. Trading will unlock in a few minutes.
          </p>
        </div>
      ) : isOpen ? (
        <div className="card card-glow mt-8 p-6">
          <p className="label-caps mb-4">Execute position</p>

          <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] px-4 py-3 font-data text-[11px]">
            <span className="text-[var(--color-muted)]">Portfolio margin</span>
            <span className="font-bold text-[var(--color-gold)]">{fmtUct(availableBalance)}</span>
          </div>

          {availableBalance <= 0 && (
            <div className="mb-4 rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.1)] px-4 py-3 text-sm text-[var(--color-gold-bright)]">
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
            {Array.from(new Set([10, 25, 50, 100, preferences.defaultStake])).sort((a, b) => a - b).map(n => (
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
              onClick={() => requestBuy('YES')}
              disabled={!!loading || insufficient || availableBalance <= 0}
              className="rounded-lg border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.12)] py-4 font-data text-sm font-bold uppercase tracking-wider text-[var(--color-gold-bright)] transition hover:bg-[rgba(251,191,36,0.2)] disabled:opacity-40"
            >
              Buy YES
            </button>
            <button
              onClick={() => requestBuy('NO')}
              disabled={!!loading || insufficient || availableBalance <= 0}
              className="rounded-lg border border-[rgba(232,93,111,0.35)] bg-[rgba(232,93,111,0.12)] py-4 font-data text-sm font-bold uppercase tracking-wider text-[var(--color-no)] transition hover:bg-[rgba(232,93,111,0.2)] disabled:opacity-40"
            >
              Buy NO
            </button>
          </div>

          <TradeConfirmModal
            open={confirmOutcome !== null}
            question={market.question}
            outcome={confirmOutcome ?? 'YES'}
            amount={stakeAmount}
            loading={loading !== null}
            onConfirm={() => confirmBuy()}
            onCancel={() => { if (!loading) setConfirmOutcome(null) }}
          />

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

      <ShareSheet
        open={shareOpen}
        title="Share market"
        shareText={marketShareText(market)}
        shareUrl={marketShareUrl(market.id)}
        onClose={() => setShareOpen(false)}
        onCopied={() => onToast('Market link copied', 'success')}
        card={{
          headline: market.question,
          subline: `YES ${yes}% · NO ${no}% · ${timeRemaining(market.deadline)}`,
        }}
      />
    </div>
  )
}