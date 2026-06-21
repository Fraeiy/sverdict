import { useState, useCallback, useEffect } from 'react'
import { useWalletConnect } from './useWalletConnect'
import { usePlatform } from './hooks/usePlatform'
import { isMisconfiguredProduction } from './lib/config'
import type { Market, Side } from './lib/types'

type Page = 'markets' | 'portfolio' | 'notifications' | 'admin'

const CATEGORIES = ['all', 'CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER']

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function yesPct(m: Market) {
  const t = (m.yes_pool || 0) + (m.no_pool || 0)
  if (!t) return 50
  return Math.round((m.yes_pool / t) * 100)
}

function timeLeft(dl: string) {
  const d = new Date(dl).getTime() - Date.now()
  if (d < 0) return 'ENDED'
  const days = Math.floor(d / 86_400_000)
  if (days > 1) return `${days}d left`
  const hrs = Math.floor(d / 3_600_000)
  if (hrs > 0) return `${hrs}h left`
  return 'Closing soon'
}

function shortAddr(addr?: string) {
  if (!addr) return '—'
  if (addr.startsWith('@')) return addr
  return addr.slice(0, 12) + '…'
}

// ─── Connect Screen ───────────────────────────────────────────────
function ConnectScreen({ wallet }: { wallet: ReturnType<typeof useWalletConnect> }) {
  const [showMethods, setShowMethods] = useState(false)
  if (wallet.isAutoConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">SPHERE<span className="text-blue-400">//</span>PREDICT</h1>
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Connecting to Sphere wallet…</p>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] p-6">
      <div className="max-w-md w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-center">SPHERE<span className="text-blue-400">//</span>PREDICT</h1>
        <p className="text-slate-400 text-center text-sm leading-relaxed">
          Connect your Sphere wallet once. Trade instantly on an internal portfolio — no gas per trade.
        </p>
        {!showMethods ? (
          <button onClick={() => setShowMethods(true)} disabled={wallet.isConnecting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-semibold transition">
            Connect Sphere Wallet
          </button>
        ) : (
          <div className="space-y-3">
            <button onClick={wallet.connect} disabled={wallet.isConnecting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition">
              {wallet.isConnecting ? 'Connecting…' : 'Auto (recommended)'}
            </button>
            {wallet.extensionInstalled && (
              <button onClick={wallet.connectViaExtension} className="w-full py-3 border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-surface-3)] transition">
                Browser extension
              </button>
            )}
            <button onClick={() => setShowMethods(false)} className="w-full text-slate-500 text-sm">Back</button>
          </div>
        )}
        {wallet.error && <p className="text-red-400 text-sm text-center">{wallet.error}</p>}
      </div>
    </div>
  )
}

// ─── Market Card ──────────────────────────────────────────────────
function MarketCard({ market, onClick }: { market: Market; onClick: (m: Market) => void }) {
  const yp = yesPct(market)
  const isOpen = market.status === 'open'
  return (
    <button onClick={() => isOpen && onClick(market)} disabled={!isOpen}
      className={`text-left w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-5 space-y-3 transition hover:border-blue-500/50 ${!isOpen ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className={`w-2 h-2 rounded-full ${market.status === 'open' ? 'bg-green-500' : market.status === 'resolved' ? 'bg-amber-500' : 'bg-slate-500'}`} />
        {market.category} · {market.status.toUpperCase()}
        {market.trending_score > 50 && <span className="ml-auto text-amber-400">🔥 Trending</span>}
      </div>
      <p className="font-medium leading-snug">{market.question}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-green-400">YES {yp}%</span>
          <span className="text-red-400">NO {100 - yp}%</span>
        </div>
        <div className="h-2 bg-[var(--color-surface-3)] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-green-500 to-green-600" style={{ width: `${yp}%` }} />
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>Vol {fmt(market.volume || 0)}</span>
        <span>{timeLeft(market.deadline)}</span>
      </div>
    </button>
  )
}

// ─── Trade Modal ──────────────────────────────────────────────────
function TradeModal({ market, balance, onTrade, onClose, signMessage }: {
  market: Market; balance: number
  onTrade: (p: { side: Side; amount: number; signature?: string; signedMessage?: string }) => Promise<void>
  onClose: () => void
  signMessage?: (msg: string) => Promise<{ signature: string; publicKey?: string }>
}) {
  const [side, setSide] = useState<Side | null>(null)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [requireSig, setRequireSig] = useState(true)
  const yp = yesPct(market)
  const total = (market.yes_pool || 0) + (market.no_pool || 0)

  async function handleTrade() {
    const a = parseFloat(amount)
    if (!side || !a || a <= 0) return
    setLoading(true)
    setMsg('Executing trade…')
    try {
      let signature: string | undefined
      let signedMessage: string | undefined
      if (requireSig && signMessage) {
        const payload = JSON.stringify({ marketId: market.id, side, amount: a, ts: Date.now() })
        const signed = await signMessage(payload)
        signature = signed.signature
        signedMessage = payload
      }
      await onTrade({ side, amount: a, signature, signedMessage })
      setMsg('✓ Trade executed!')
      setTimeout(onClose, 1000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Trade failed')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-400 mb-1">{market.category} · {market.status.toUpperCase()}</p>
            <h2 className="text-lg font-semibold">{market.question}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-xs text-slate-400">Pool</p>
              <p className="font-semibold text-amber-400">{fmt(total)}</p>
            </div>
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-xs text-slate-400">YES</p>
              <p className="font-semibold text-green-400">{yp}%</p>
            </div>
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-xs text-slate-400">NO</p>
              <p className="font-semibold text-red-400">{100 - yp}%</p>
            </div>
          </div>

          {market.status === 'open' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">Portfolio balance: <span className="text-white font-medium">{fmt(balance)}</span></p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSide('YES')}
                  className={`py-4 rounded-xl border-2 font-bold transition ${side === 'YES' ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-[var(--color-border)] hover:border-green-500/50'}`}>
                  BUY YES
                </button>
                <button onClick={() => setSide('NO')}
                  className={`py-4 rounded-xl border-2 font-bold transition ${side === 'NO' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-[var(--color-border)] hover:border-red-500/50'}`}>
                  BUY NO
                </button>
              </div>
              <input type="number" min="1" placeholder="Amount ($)" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-3 outline-none focus:border-blue-500" />
              <div className="flex gap-2 flex-wrap">
                {[25, 50, 100, 250].map(n => (
                  <button key={n} onClick={() => setAmount(String(n))} className="px-3 py-1 text-xs border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-3)]">{n}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" checked={requireSig} onChange={e => setRequireSig(e.target.checked)} />
                Require Sphere signature before trade
              </label>
              {msg && <p className="text-sm text-center text-slate-300">{msg}</p>}
              <button onClick={handleTrade} disabled={!side || !amount || loading || parseFloat(amount) > balance}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl font-semibold transition">
                {loading ? 'Processing…' : side ? `Buy ${side} — ${amount || '?'}` : 'Select a side'}
              </button>
            </div>
          ) : (
            <p className="text-center text-slate-400 py-4">
              {market.status === 'resolved' ? `Resolved: ${market.resolution}` : 'Market closed — awaiting resolution'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const wallet = useWalletConnect()
  const platform = usePlatform(wallet.identity)
  const [page, setPage] = useState<Page>('markets')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  const [openMarket, setOpenMarket] = useState<Market | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [depositAmt, setDepositAmt] = useState('50')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [adminQ, setAdminQ] = useState('')
  const [adminCat, setAdminCat] = useState('CRYPTO')
  const [adminDays, setAdminDays] = useState(7)

  const showToast = useCallback((msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    platform.refreshMarkets({ search, category, status: statusFilter, trending: page === 'markets' }).catch(() => {})
  }, [search, category, statusFilter, page])

  if (isMisconfiguredProduction()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-surface)]">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold">Production setup incomplete</h1>
          <p className="text-slate-400 text-sm">
            Add <code className="text-amber-400">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-amber-400">VITE_SUPABASE_ANON_KEY</code> in Vercel environment variables, then redeploy.
          </p>
          <p className="text-slate-500 text-xs">See PRODUCTION.md in the repo.</p>
        </div>
      </div>
    )
  }

  if (!wallet.isConnected) return <ConnectScreen wallet={wallet} />
  if (wallet.isWalletLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Wallet locked. Unlock in Sphere and reconnect.</p>
          <button onClick={wallet.connect} className="px-6 py-2 bg-blue-600 rounded-xl">Reconnect</button>
        </div>
      </div>
    )
  }

  const addr = wallet.identity?.nametag || shortAddr(wallet.identity?.directAddress)
  const isAdmin = platform.user?.is_admin
  const portfolio = platform.portfolio
  const nav: Page[] = ['markets', 'portfolio', 'notifications', ...(isAdmin ? ['admin' as Page] : [])]

  async function handleDeposit() {
    const amt = parseFloat(depositAmt)
    if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return }
    try {
      showToast('Approve transfer in your Sphere wallet…', 'info')
      if (platform.treasuryAddress && wallet.sendPayment) {
        await wallet.sendPayment({ recipient: platform.treasuryAddress, amountHuman: amt, coinId: 'UCT', memo: 'SPHERE_PREDICT_DEPOSIT' })
      }
      await platform.deposit(amt, `deposit_${Date.now()}`)
      await wallet.refreshBalance()
      showToast(`Deposited ${fmt(amt)} to portfolio`, 'success')
      setShowDeposit(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Deposit failed', 'error')
    }
  }

  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmt || String(portfolio?.available_balance || 0))
    if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return }
    try {
      await platform.withdraw(amt)
      showToast(`Withdrew ${fmt(amt)} to wallet`, 'success')
      setShowWithdraw(false)
      setWithdrawAmt('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Withdraw failed', 'error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <h1 className="font-bold text-lg shrink-0">SPHERE<span className="text-blue-400">//</span>PREDICT</h1>
          <nav className="flex gap-1">
            {nav.map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition ${page === p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-[var(--color-surface-3)]'}`}>
                {p}
                {p === 'notifications' && platform.unreadCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 rounded-full">{platform.unreadCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-slate-500 uppercase">
              {platform.backendMode === 'supabase' ? 'Supabase' : 'REST API'}
            </span>
            <span className="text-slate-400">{addr}</span>
            <span className="text-amber-400 font-medium">{wallet.balanceHuman} UCT</span>
            <button onClick={wallet.disconnect} className="text-slate-500 hover:text-white">✕</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {/* ── MARKETS ── */}
        {page === 'markets' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Markets</h2>
              <p className="text-slate-400 text-sm">Browse active markets · Instant internal trades</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search markets…"
                className="flex-1 min-w-[200px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" />
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${category === c ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-[var(--color-border)] text-slate-400'}`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {['open', 'closed', 'resolved', 'all'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs ${statusFilter === s ? 'bg-[var(--color-surface-3)] text-white' : 'text-slate-500'}`}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            {platform.markets.length === 0 ? (
              <p className="text-center text-slate-500 py-12">No markets found</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {platform.markets.map(m => <MarketCard key={m.id} market={m} onClick={setOpenMarket} />)}
              </div>
            )}
          </div>
        )}

        {/* ── PORTFOLIO ── */}
        {page === 'portfolio' && portfolio && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">Portfolio</h2>
                <p className="text-slate-400 text-sm">Your balances, positions & PnL</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowDeposit(true)} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-semibold">Deposit</button>
                <button onClick={() => setShowWithdraw(true)} className="px-4 py-2 border border-[var(--color-border)] hover:bg-[var(--color-surface-3)] rounded-xl text-sm font-semibold">Withdraw</button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Available Balance', value: fmt(portfolio.available_balance) },
                { label: 'Total Portfolio Value', value: fmt(portfolio.total_portfolio_value) },
                { label: 'Unrealized PnL', value: fmt(portfolio.unrealized_pnl), color: portfolio.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Realized PnL', value: fmt(portfolio.realized_pnl), color: portfolio.realized_pnl >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Total PnL', value: fmt(portfolio.total_pnl), color: portfolio.total_pnl >= 0 ? 'text-green-400' : 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color || ''}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <section>
              <h3 className="font-semibold mb-3">Open Positions</h3>
              {portfolio.open_positions.length === 0 ? (
                <p className="text-slate-500 text-sm">No open positions</p>
              ) : (
                <div className="space-y-2">
                  {portfolio.open_positions.map(p => (
                    <div key={p.id} className="flex items-center gap-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-4 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.side === 'YES' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{p.side}</span>
                      <span className="flex-1 truncate">{p.market?.question || p.market_id}</span>
                      <span className="text-slate-400">{fmt(p.cost_basis)}</span>
                      <span className={p.unrealized_pnl! >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {(p.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{fmt(p.unrealized_pnl ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="font-semibold mb-3">Resolved Positions</h3>
              {portfolio.resolved_positions.length === 0 ? (
                <p className="text-slate-500 text-sm">No resolved positions yet</p>
              ) : (
                <div className="space-y-2">
                  {portfolio.resolved_positions.map(p => (
                    <div key={p.id} className="flex items-center gap-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-4 text-sm opacity-80">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.side === 'YES' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{p.side}</span>
                      <span className="flex-1 truncate">{p.market?.question || p.market_id}</span>
                      <span className="text-slate-400">Invested {fmt(p.cost_basis)}</span>
                      <span className={p.pnl! >= 0 ? 'text-green-400' : 'text-red-400'}>
                        Payout {fmt(p.payout ?? 0)} · PnL {(p.pnl ?? 0) >= 0 ? '+' : ''}{fmt(p.pnl ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {page === 'notifications' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Notifications</h2>
                <p className="text-slate-400 text-sm">Deposits, trades, settlements & more</p>
              </div>
              {platform.unreadCount > 0 && (
                <button onClick={() => platform.markAllRead()} className="text-sm text-blue-400 hover:text-blue-300">Mark all read</button>
              )}
            </div>
            {platform.notifications.length === 0 ? (
              <p className="text-center text-slate-500 py-12">No notifications yet</p>
            ) : (
              <div className="space-y-2">
                {platform.notifications.map(n => (
                  <button key={n.id} onClick={() => !n.read && platform.markRead(n.id)}
                    className={`w-full text-left p-4 rounded-xl border transition ${n.read ? 'bg-[var(--color-surface-2)] border-[var(--color-border)] opacity-60' : 'bg-[var(--color-surface-3)] border-blue-500/30'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded uppercase font-medium ${
                        n.type === 'deposit' ? 'bg-green-500/20 text-green-400' :
                        n.type === 'withdrawal' ? 'bg-amber-500/20 text-amber-400' :
                        n.type === 'trade' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                      }`}>{n.type}</span>
                      <span className="font-medium text-sm">{n.title}</span>
                      <span className="ml-auto text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-400">{n.body}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ADMIN ── */}
        {page === 'admin' && isAdmin && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Admin Dashboard</h2>
              <p className="text-slate-400 text-sm">Create, close & resolve markets · Treasury: {shortAddr(platform.treasuryAddress)}</p>
            </div>
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
              <h3 className="font-semibold">Create Market</h3>
              <textarea value={adminQ} onChange={e => setAdminQ(e.target.value)} placeholder="Market question…"
                className="w-full bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-3 outline-none min-h-[80px]" />
              <div className="flex gap-4">
                <select value={adminCat} onChange={e => setAdminCat(e.target.value)}
                  className="bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-2">
                  {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c}>{c}</option>)}
                </select>
                <input type="number" min={1} value={adminDays} onChange={e => setAdminDays(Number(e.target.value))}
                  className="w-24 bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-2" />
                <span className="text-slate-400 self-center text-sm">days</span>
              </div>
              <button onClick={async () => {
                if (!adminQ.trim()) { showToast('Enter a question', 'error'); return }
                try { await platform.createMarket({ question: adminQ, category: adminCat, daysOpen: adminDays }); setAdminQ(''); showToast('Market created') }
                catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
              }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold">+ Create Market</button>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold">Manage Markets</h3>
              {platform.markets.filter(m => m.status !== 'resolved').map(m => (
                <div key={m.id} className="flex items-center gap-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-4">
                  <span className="flex-1 text-sm">{m.question}</span>
                  <span className="text-xs text-slate-400">{m.status}</span>
                  {m.status === 'open' && (
                    <button onClick={() => platform.closeMarket(m.id)} className="px-3 py-1 text-xs border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-3)]">Close</button>
                  )}
                  {m.status !== 'resolved' && (
                    <>
                      <button onClick={() => platform.resolveMarket(m.id, 'YES')} className="px-3 py-1 text-xs bg-green-600/20 text-green-400 rounded-lg">YES</button>
                      <button onClick={() => platform.resolveMarket(m.id, 'NO')} className="px-3 py-1 text-xs bg-red-600/20 text-red-400 rounded-lg">NO</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowDeposit(false)}>
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Deposit</h3>
            <p className="text-sm text-slate-400">Send UCT from your Sphere wallet to the platform treasury. Funds appear in your portfolio balance.</p>
            <input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
              className="w-full bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-3" />
            <button onClick={handleDeposit} className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-semibold">Deposit to Portfolio</button>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowWithdraw(false)}>
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Withdraw</h3>
            <p className="text-sm text-slate-400">Available: {fmt(portfolio?.available_balance ?? 0)}</p>
            <input type="number" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} placeholder="Amount (empty = all)"
              className="w-full bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-3" />
            <button onClick={handleWithdraw} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold">Withdraw to Wallet</button>
          </div>
        </div>
      )}

      {/* Trade Modal */}
      {openMarket && (
        <TradeModal
          market={platform.markets.find(m => m.id === openMarket.id) || openMarket}
          balance={portfolio?.available_balance ?? 0}
          signMessage={wallet.signMessage}
          onTrade={async p => { await platform.trade({ marketId: openMarket.id, ...p }); showToast(`Bought ${p.side} for ${fmt(p.amount)}`) }}
          onClose={() => setOpenMarket(null)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.type === 'error' ? 'bg-red-600' : toast.type === 'info' ? 'bg-blue-600' : 'bg-green-600'
        }`}>{toast.msg}</div>
      )}
    </div>
  )
}