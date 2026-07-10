import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FundingPanel } from '../components/portfolio/FundingPanel'
import { HistoryList } from '../components/portfolio/HistoryList'
import { PendingWithdrawalBanner } from '../components/portfolio/PendingWithdrawalBanner'
import { PositionCard } from '../components/portfolio/PositionCard'
import { useHistory } from '../hooks/useHistory'
import { usePositions } from '../hooks/usePositions'
import { useSpherePayment } from '../hooks/useSpherePayment'
import { usePlatform } from '../hooks/usePlatform'
import type { WalletIdentity } from '../lib/types'
import { fmtUct, realizedPnl } from '../lib/format'

type Tab = 'overview' | 'positions' | 'history'

type Props = {
  identity: WalletIdentity | null
  wallet: {
    sendPayment?: (p: { recipient: string; amountHuman: number; coinId?: string; memo?: string }) => Promise<unknown>
    refreshBalance?: () => Promise<void>
  }
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function tabFromParam(value: string | null): Tab {
  if (value === 'positions' || value === 'history') return value
  return 'overview'
}

export function PortfolioPage({ identity, wallet, onToast }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get('tab')))

  const platform = usePlatform(identity)
  const { portfolio, openPositions, resolvedPositions, availableBalance, deposit, withdraw, loading, refresh } = usePositions(identity)
  const { entries: history, loading: historyLoading, pendingWithdrawals, refresh: refreshHistory } = useHistory(identity)
  const { depositToPortfolio } = useSpherePayment(wallet, platform.treasuryAddress)
  const withdrawalStatusRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const next = tabFromParam(searchParams.get('tab'))
    setTab(next)
    if (next === 'history') refreshHistory().catch(() => {})
  }, [searchParams, refreshHistory])

  useEffect(() => {
    for (const entry of history) {
      if (entry.type !== 'withdrawal' || !entry.status) continue
      const prev = withdrawalStatusRef.current.get(entry.id)
      const status = String(entry.status)
      if (prev !== undefined && prev !== status) {
        if (status === 'completed') {
          onToast(`${fmtUct(entry.amount)} sent to your Sphere wallet`, 'success')
          refresh().catch(() => {})
          wallet.refreshBalance?.()
        } else if (status === 'failed') {
          onToast(`${fmtUct(entry.amount)} withdrawal failed — balance restored`, 'error')
          refresh().catch(() => {})
        } else if (status === 'processing' && prev === 'submitted') {
          onToast(`Treasury is sending ${fmtUct(entry.amount)}…`, 'info')
        }
      }
      withdrawalStatusRef.current.set(entry.id, status)
    }
  }, [history, onToast, refresh, wallet])

  function selectTab(next: Tab) {
    setTab(next)
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true })
  }

  async function handleDeposit(amount: number) {
    try {
      onToast('Approve deposit in your Sphere wallet…', 'info')
      const payment = await depositToPortfolio(amount, platform.user?.id)
      await deposit(amount, payment.txReference, payment.memo)
      await wallet.refreshBalance?.()
      await refresh()
      await refreshHistory()
      onToast(`Deposited ${fmtUct(amount)}`, 'success')
    } catch (e) {
      await refresh().catch(() => {})
      await refreshHistory().catch(() => {})
      onToast(e instanceof Error ? e.message : 'Deposit failed', 'error')
    }
  }

  async function handleWithdraw(amount: number) {
    try {
      await withdraw(amount)
      await refresh()
      await refreshHistory()
      onToast(`Withdrawal of ${fmtUct(amount)} queued — treasury will send to your Sphere wallet`, 'info')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Withdraw failed', 'error')
      throw e
    }
  }

  if (loading && !portfolio) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center font-data text-sm text-[var(--color-muted)]">
        Loading portfolio…
      </div>
    )
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'positions', label: 'Positions', badge: openPositions.length || undefined },
    { id: 'history', label: 'History' },
  ]

  const totalPnl = portfolio?.total_pnl ?? 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <p className="label-caps mb-2">Account</p>
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="mt-2 text-[var(--color-text-2)]">Margin, positions, and settlement history</p>
      </div>

      <FundingPanel
        availableBalance={availableBalance}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
      />

      {pendingWithdrawals.length > 0 && (
        <div className="mt-6">
          <PendingWithdrawalBanner pending={pendingWithdrawals} />
        </div>
      )}

      <div className="tab-nav mt-8 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={`tab-item flex items-center gap-2 ${tab === t.id ? 'tab-item-active' : ''}`}
          >
            {t.label}
            {t.badge ? (
              <span className="rounded bg-[rgba(245,158,11,0.2)] px-1.5 py-0.5 font-data text-[9px] text-[var(--color-gold-bright)]">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === 'overview' && (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total value" value={fmtUct(portfolio?.total_portfolio_value ?? 0)} gold />
              <Stat label="Available" value={fmtUct(availableBalance)} />
              <Stat label="In positions" value={fmtUct(portfolio?.total_staked ?? 0)} />
              <Stat
                label="Total PnL"
                value={`${totalPnl >= 0 ? '+' : ''}${fmtUct(totalPnl)}`}
                yes={totalPnl >= 0}
                no={totalPnl < 0}
              />
            </div>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-data text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">Open positions</h2>
                {openPositions.length > 0 && (
                  <button
                    onClick={() => selectTab('positions')}
                    className="font-data text-[10px] text-[var(--color-gold)] hover:underline"
                  >
                    VIEW ALL →
                  </button>
                )}
              </div>
              {openPositions.length === 0 ? (
                <div className="card rounded-xl border-dashed py-10 text-center font-data text-sm text-[var(--color-muted)]">
                  No open positions — deposit margin and trade on a market
                </div>
              ) : (
                <div className="space-y-3">
                  {openPositions.slice(0, 3).map(p => <PositionCard key={p.id} position={p} />)}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'positions' && (
          <div className="space-y-10">
            <section>
              <h2 className="mb-4 font-data text-xs font-bold uppercase tracking-wider">Open positions</h2>
              {openPositions.length === 0 ? (
                <div className="card rounded-xl border-dashed py-12 text-center font-data text-sm text-[var(--color-muted)]">
                  No open positions — deposit margin and trade on a market
                </div>
              ) : (
                <div className="space-y-3">
                  {openPositions.map(p => <PositionCard key={p.id} position={p} />)}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 font-data text-xs font-bold uppercase tracking-wider">Resolved positions</h2>
              {resolvedPositions.length === 0 ? (
                <p className="font-data text-sm text-[var(--color-muted)]">No resolved positions yet</p>
              ) : (
                <div className="space-y-3">
                  {resolvedPositions.map(p => {
                    const stake = Number(p.stake_amount ?? p.cost_basis ?? 0)
                    const payout = Number(p.payout ?? 0)
                    const net = realizedPnl(p)
                    const won = payout > 0
                    return (
                      <div key={p.id} className="card p-5 opacity-90">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{p.market?.question || p.market_id}</p>
                          <span className={`chip ${(p.outcome || p.side) === 'YES' ? 'chip-yes' : 'chip-no'}`}>
                            {p.outcome || p.side}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-6 font-data text-[11px] text-[var(--color-text-2)]">
                          <span>Staked <span className="text-[var(--color-text)]">{fmtUct(stake)}</span></span>
                          {won && <span>Payout <span className="text-[var(--color-gold)]">{fmtUct(payout)}</span></span>}
                          <span className={net >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}>
                            Net PnL {net >= 0 ? '+' : ''}{fmtUct(net)}
                          </span>
                        </div>
                        {won && net === 0 && (
                          <p className="mt-2 font-data text-[10px] text-[var(--color-muted)]">
                            Outcome won — returned stake (no opposing pool liquidity).
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'history' && (
          <HistoryList entries={history} loading={historyLoading} />
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, gold, yes, no }: {
  label: string
  value: string
  gold?: boolean
  yes?: boolean
  no?: boolean
}) {
  return (
    <div className="stat-block">
      <p className="label-caps">{label}</p>
      <p className={`stat-value mt-2 ${gold ? 'stat-value-gold' : yes ? 'stat-value-yes' : no ? 'stat-value-no' : ''}`}>
        {value}
      </p>
    </div>
  )
}