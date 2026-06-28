import { FundingPanel } from '../components/portfolio/FundingPanel'
import { PositionCard } from '../components/portfolio/PositionCard'
import { usePositions } from '../hooks/usePositions'
import { useSpherePayment } from '../hooks/useSpherePayment'
import { usePlatform } from '../hooks/usePlatform'
import type { WalletIdentity } from '../lib/types'
import { fmtUct } from '../lib/format'

type Props = {
  identity: WalletIdentity | null
  wallet: {
    sendPayment?: (p: { recipient: string; amountHuman: number; coinId?: string; memo?: string }) => Promise<unknown>
    refreshBalance?: () => Promise<void>
  }
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function PortfolioPage({ identity, wallet, onToast }: Props) {
  const platform = usePlatform(identity)
  const { portfolio, openPositions, resolvedPositions, availableBalance, deposit, withdraw, loading } = usePositions(identity)
  const { depositToPortfolio } = useSpherePayment(wallet, platform.treasuryAddress)

  async function handleDeposit(amount: number) {
    try {
      onToast('Approve deposit in your Sphere wallet…', 'info')
      const payment = await depositToPortfolio(amount)
      await deposit(amount, payment.txReference)
      await wallet.refreshBalance?.()
      onToast(`Deposited ${fmtUct(amount)}`, 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Deposit failed', 'error')
      throw e
    }
  }

  async function handleWithdraw(amount: number) {
    try {
      await withdraw(amount)
      onToast(`Withdrew ${fmtUct(amount)} to your Sphere wallet`, 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Withdraw failed', 'error')
      throw e
    }
  }

  if (loading && !portfolio) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
        Loading portfolio…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="mt-2 text-slate-400">Your margin balance, positions, and PnL</p>
      </div>

      <FundingPanel
        availableBalance={availableBalance}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
      />

      <div className="mb-10 mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Total value" value={fmtUct(portfolio?.total_portfolio_value ?? 0)} />
        <Stat label="In positions" value={fmtUct(portfolio?.total_staked ?? 0)} />
        <Stat
          label="Unrealized PnL"
          value={`${(portfolio?.unrealized_pnl ?? 0) >= 0 ? '+' : ''}${fmtUct(portfolio?.unrealized_pnl ?? 0)}`}
          accent={(portfolio?.unrealized_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
        <Stat
          label="Realized PnL"
          value={`${(portfolio?.realized_pnl ?? 0) >= 0 ? '+' : ''}${fmtUct(portfolio?.realized_pnl ?? 0)}`}
          accent={(portfolio?.realized_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Open positions</h2>
        {openPositions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-slate-500">
            No open positions — deposit margin and trade on a market
          </div>
        ) : (
          <div className="space-y-3">
            {openPositions.map(p => <PositionCard key={p.id} position={p} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Resolved positions</h2>
        {resolvedPositions.length === 0 ? (
          <p className="text-sm text-slate-500">No resolved positions yet</p>
        ) : (
          <div className="space-y-3">
            {resolvedPositions.map(p => (
              <div key={p.id} className="rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-5 opacity-80">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{p.market?.question || p.market_id}</p>
                  <span className={`rounded-lg px-2 py-1 text-xs font-bold ${
                    (p.outcome || p.side) === 'YES' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}>
                    {p.outcome || p.side}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-6 text-sm text-slate-400">
                  <span>Staked {fmtUct(p.stake_amount ?? p.cost_basis)}</span>
                  <span className={(p.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    PnL {(p.pnl ?? 0) >= 0 ? '+' : ''}{fmtUct(p.pnl ?? 0)}
                  </span>
                  {(p.payout ?? 0) > 0 && <span className="text-emerald-400">Won {fmtUct(p.payout ?? 0)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[var(--color-surface-2)] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent || ''}`}>{value}</p>
    </div>
  )
}