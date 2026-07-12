import { useCallback, useEffect, useRef, useState } from 'react'
import { useMarkets } from '../hooks/useMarkets'
import type { PlatformApi } from '../hooks/usePlatform'
import { useVisibleInterval } from '../hooks/useVisibleInterval'
import { fmtUct, formatAge, timeRemaining, type WorkerHealth } from '../lib/format'

const CATEGORIES = ['CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER']

type QueueRow = {
  id: string
  amount: number
  status: string
  created_at: string
  completed_at?: string | null
  tx_reference?: string | null
  failure_reason?: string | null
  users?: { nametag?: string | null; wallet_address?: string }
}

type PendingWithdrawal = {
  id: string
  amount: number
  status: string
  created_at: string
  users?: { nametag?: string | null; wallet_address?: string }
}

type SeedQueueRow = {
  id: string
  question: string
  seed_liquidity: number
  seed_status: string
  created_at: string
  seed_completed_at?: string | null
  seed_tx_reference?: string | null
  seed_failure_reason?: string | null
}

const STATUS_CHIP: Record<string, string> = {
  submitted: 'chip-neutral',
  processing: 'chip-gold',
  completed: 'chip-yes',
  failed: 'chip-no',
}

type Props = {
  platform: PlatformApi
  onToast: (msg: string, type?: 'success' | 'error') => void
}

export function AdminPage({ platform, onToast }: Props) {
  const { markets, load } = useMarkets({ autoLoad: false })

  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState('')
  const [category, setCategory] = useState('CRYPTO')
  const [days, setDays] = useState(7)

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<QueueRow[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([])
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)
  const [onChainBalance, setOnChainBalance] = useState<number | null>(null)
  const [spendableBalance, setSpendableBalance] = useState<number | null>(null)
  const [uctTokenCount, setUctTokenCount] = useState<number | null>(null)
  const [largestCoin, setLargestCoin] = useState<number | null>(null)
  const [seedPerMarket, setSeedPerMarket] = useState(100)
  const [treasuryStatusFresh, setTreasuryStatusFresh] = useState(false)
  const [workerLastRunAt, setWorkerLastRunAt] = useState<string | null>(null)
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth>('unknown')
  const [workerAgeMinutes, setWorkerAgeMinutes] = useState<number | null>(null)
  const [seedCounts, setSeedCounts] = useState<Record<string, number>>({})
  const [recentSeeds, setRecentSeeds] = useState<SeedQueueRow[]>([])
  const [seedQueueLoading, setSeedQueueLoading] = useState(false)

  const onToastRef = useRef(onToast)
  onToastRef.current = onToast
  const platformRef = useRef(platform)
  platformRef.current = platform
  const queueApiAvailable = useRef(true)

  const applyPendingFallback = useCallback((pending: PendingWithdrawal[]) => {
    setCounts({
      submitted: pending.length,
      processing: 0,
      completed: 0,
      failed: 0,
    })
    setRecent(pending.map(w => ({
      id: w.id,
      amount: w.amount,
      status: w.status || 'submitted',
      created_at: w.created_at,
      users: w.users,
    })))
  }, [])

  const applyTreasury = useCallback((s: {
    onChainBalance: number
    spendableAfterReserves: number
    uctTokenCount: number
    largestCoin: number
    seedPerMarket: number
    statusFresh: boolean
    statusUpdatedAt: string | null
    workerHealth: WorkerHealth
    statusAgeMinutes: number | null
  }) => {
    setOnChainBalance(s.onChainBalance)
    setSpendableBalance(s.spendableAfterReserves)
    setUctTokenCount(s.uctTokenCount)
    setLargestCoin(s.largestCoin)
    setSeedPerMarket(s.seedPerMarket)
    setTreasuryStatusFresh(s.statusFresh)
    setWorkerLastRunAt(s.statusUpdatedAt)
    setWorkerHealth(s.workerHealth)
    setWorkerAgeMinutes(s.statusAgeMinutes)
  }, [])

  const loadDashboard = useCallback(async () => {
    const p = platformRef.current
    if (!p.isAdmin) return
    setQueueLoading(true)
    setSeedQueueLoading(true)
    try {
      const { treasury, withdrawals, seeds } = await p.adminDashboard()
      applyTreasury(treasury)
      setCounts(withdrawals.counts || {})
      setRecent((withdrawals.recent || []) as QueueRow[])
      setSeedCounts(seeds.counts || {})
      setRecentSeeds((seeds.recent || []) as SeedQueueRow[])
      queueApiAvailable.current = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      const staleEdge = msg.includes('Not found') || msg.includes('404')
      if (staleEdge) {
        queueApiAvailable.current = false
        try {
          const [pending, treasury] = await Promise.all([
            p.listPendingWithdrawals(),
            p.treasurySeed().catch(() => null),
          ])
          applyPendingFallback((pending.withdrawals || []) as PendingWithdrawal[])
          if (treasury) applyTreasury(treasury)
        } catch { /* ignore */ }
      } else {
        onToastRef.current(msg || 'Failed to load admin dashboard', 'error')
      }
    } finally {
      setQueueLoading(false)
      setSeedQueueLoading(false)
    }
  }, [applyPendingFallback, applyTreasury])

  const loadPending = useCallback(async () => {
    const p = platformRef.current
    if (!p.isAdmin) return
    try {
      const { withdrawals } = await p.listPendingWithdrawals()
      setPendingWithdrawals((withdrawals || []) as PendingWithdrawal[])
    } catch { /* optional for manual override */ }
  }, [])

  useEffect(() => {
    load({ trending: true, includePendingSeed: true }).catch(() => {})
  }, [load])

  useVisibleInterval(() => { loadDashboard().catch(() => {}) }, 30_000, platform.isAdmin)

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
      await load({ trending: true, includePendingSeed: true })
      await loadDashboard()
      onToast('Market queued — treasury will seed on-chain before trading opens')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to create market', 'error')
    }
  }

  async function fulfillWithdrawal(w: PendingWithdrawal) {
    const recipient = w.users?.nametag || w.users?.wallet_address || 'user'
    const txRef = window.prompt(
      `Emergency manual fulfill: ${fmtUct(w.amount)} to ${recipient}.\n\nPaste Sphere tx reference (or leave blank):`,
    )
    if (txRef === null) return

    setFulfillingId(w.id)
    try {
      await platform.fulfillWithdrawal(w.id, txRef.trim() || undefined)
      await loadDashboard()
      await loadPending()
      onToast(`Marked ${fmtUct(w.amount)} withdrawal as sent`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to fulfill withdrawal', 'error')
    } finally {
      setFulfillingId(null)
    }
  }

  async function openManualOverride() {
    setShowManual(v => !v)
    if (!showManual) await loadPending()
  }

  const activeMarkets = markets.filter(m => m.status !== 'resolved')

  const workerHealthChip: Record<WorkerHealth, string> = {
    ok: 'chip-yes',
    delayed: 'chip-gold',
    stale: 'chip-no',
    unknown: 'chip-neutral',
  }
  const workerHealthLabel: Record<WorkerHealth, string> = {
    ok: 'On schedule',
    delayed: 'Delayed (GitHub schedule)',
    stale: 'Stale — run workflow or set up external cron',
    unknown: 'No worker data yet',
  }

  if (!platform.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center font-data text-sm text-[var(--color-muted)]">
        Admin access required — connect with the @sphere-predict treasury wallet.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="label-caps mb-2">Operations</p>
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2 text-[var(--color-text-2)]">Create markets, resolve outcomes, monitor treasury withdrawals</p>

      <div className={`card mt-8 p-5 ${
        workerHealth === 'ok'
          ? 'border-[rgba(34,197,94,0.28)]'
          : workerHealth === 'delayed'
            ? 'border-[rgba(245,158,11,0.35)]'
            : 'border-[rgba(248,113,113,0.35)]'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label-caps">Treasury worker</p>
            <p className="mt-1 font-data text-lg font-bold text-[var(--color-gold)]">
              {workerLastRunAt ? formatAge(workerLastRunAt) : 'Never reported'}
            </p>
            <p className="mt-1 font-data text-[10px] text-[var(--color-muted)]">
              {workerLastRunAt
                ? `Last on-chain publish: ${new Date(workerLastRunAt).toLocaleString()}`
                : 'Run GitHub Actions once or apply migration 014'}
              {workerAgeMinutes != null && workerAgeMinutes >= 60 && (
                <> · GitHub scheduled runs are often 60–120 min apart</>
              )}
            </p>
          </div>
          <span className={`chip capitalize ${workerHealthChip[workerHealth]}`}>
            {workerHealthLabel[workerHealth]}
          </span>
        </div>
        {workerHealth !== 'ok' && (
          <p className="mt-3 text-xs text-[var(--color-text-2)]">
            For mainnet: set up external cron with <code className="font-data text-[10px]">npm run treasury:trigger</code> every 10 min,
            or GitHub → Actions → Treasury Agent → <strong>Run workflow</strong>.
          </p>
        )}
      </div>

      <div className="card mt-8 border-[rgba(245,158,11,0.28)] p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Treasury withdrawal queue</h2>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              GitHub Actions triggers the treasury agent on a schedule (best-effort — often 10–60 min apart). Each run performs multiple passes. Use Run workflow if urgent.
            </p>
          </div>
          <button
            onClick={() => loadDashboard()}
            disabled={queueLoading}
            className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['submitted', 'processing', 'completed', 'failed'] as const).map(status => (
            <div key={status} className="stat-block text-center">
              <p className="label-caps capitalize">{status}</p>
              <p className="mt-1 font-data text-2xl font-bold text-[var(--color-gold)]">
                {counts[status] ?? 0}
              </p>
            </div>
          ))}
        </div>

        {queueLoading && recent.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Loading queue…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No withdrawals yet</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {recent.map(w => {
              const recipient = w.users?.nametag || w.users?.wallet_address || 'Unknown'
              return (
                <div key={w.id} className="card flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{fmtUct(w.amount)}</p>
                      <span className={`chip capitalize ${STATUS_CHIP[w.status] || 'chip-neutral'}`}>
                        {w.status}
                      </span>
                    </div>
                    <p className="mt-1 font-data text-[10px] text-[var(--color-muted)]">
                      To {recipient} · {new Date(w.created_at).toLocaleString()}
                    </p>
                    {w.tx_reference && (
                      <p className="mt-1 truncate font-data text-[9px] text-[var(--color-text-2)]" title={w.tx_reference}>
                        Tx {w.tx_reference}
                      </p>
                    )}
                    {w.failure_reason && (
                      <p className="mt-1 text-xs text-[var(--color-no)]">{w.failure_reason}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={openManualOverride}
          className="mt-4 font-data text-[10px] text-[var(--color-muted)] hover:text-[var(--color-gold)]"
        >
          {showManual ? '▾ Hide manual override' : '▸ Manual override (agent failed)'}
        </button>

        {showManual && (
          <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] p-4">
            <p className="mb-3 text-xs text-[var(--color-text-2)]">
              Only use if you sent UCT manually from @sphere-predict and the agent did not mark the withdrawal complete.
            </p>
            {pendingWithdrawals.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No submitted withdrawals waiting</p>
            ) : (
              <div className="space-y-2">
                {pendingWithdrawals.map(w => {
                  const recipient = w.users?.nametag || w.users?.wallet_address || 'Unknown'
                  return (
                    <div key={w.id} className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{fmtUct(w.amount)} → {recipient}</p>
                      </div>
                      <button
                        onClick={() => fulfillWithdrawal(w)}
                        disabled={fulfillingId === w.id}
                        className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] disabled:opacity-50"
                      >
                        {fulfillingId === w.id ? 'Saving…' : 'Mark sent'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card mt-8 border-[rgba(34,197,94,0.22)] p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Market seed queue</h2>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              Treasury agent sends {fmtUct(seedPerMarket)} UCT on-chain per market before pools go live.
            </p>
          </div>
          <button
            onClick={() => loadDashboard()}
            disabled={seedQueueLoading}
            className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['pending', 'processing', 'completed', 'failed'] as const).map(status => (
            <div key={status} className="stat-block text-center">
              <p className="label-caps capitalize">{status}</p>
              <p className="mt-1 font-data text-2xl font-bold text-[var(--color-gold)]">
                {seedCounts[status] ?? 0}
              </p>
            </div>
          ))}
        </div>

        {recentSeeds.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No market seeds yet</p>
        ) : (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {recentSeeds.map(s => (
              <div key={s.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{fmtUct(s.seed_liquidity)}</p>
                    <span className={`chip capitalize ${STATUS_CHIP[s.seed_status] || 'chip-neutral'}`}>
                      {s.seed_status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm">{s.question}</p>
                  {s.seed_tx_reference && (
                    <p className="mt-1 truncate font-data text-[9px] text-[var(--color-text-2)]" title={s.seed_tx_reference}>
                      Tx {s.seed_tx_reference}
                    </p>
                  )}
                  {s.seed_failure_reason && (
                    <p className="mt-1 text-xs text-[var(--color-no)]">{s.seed_failure_reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mt-8 p-6">
        <h2 className="mb-4 font-data text-xs font-bold uppercase tracking-wider">Create market</h2>
        <p className="mb-4 text-sm text-[var(--color-text-2)]">
          Each new market requires <strong className="text-[var(--color-gold)]">{fmtUct(seedPerMarket)}</strong> on-chain from @sphere-predict — 50 YES / 50 NO pools activate after the treasury agent confirms the send.
        </p>
        {onChainBalance != null && (
          <div className={`mb-4 space-y-1 font-data text-[11px] ${!treasuryStatusFresh || (spendableBalance ?? 0) < seedPerMarket ? 'text-[var(--color-no)]' : 'text-[var(--color-muted)]'}`}>
            <p>
              On-chain @sphere-predict: <span className="font-bold text-[var(--color-gold)]">{fmtUct(onChainBalance)}</span>
              {uctTokenCount != null && uctTokenCount > 1 && (
                <> · {uctTokenCount} UCT coins{largestCoin != null ? ` (largest ${fmtUct(largestCoin)})` : ''}</>
              )}
            </p>
            <p>
              Spendable after reserves: <span className="font-bold">{fmtUct(spendableBalance ?? 0)}</span>
              {!treasuryStatusFresh && workerHealth !== 'stale' && (
                <> — last worker report is older than 90m (normal with GitHub schedule)</>
              )}
              {workerHealth === 'stale' && (
                <> — treasury status very stale; run GitHub Actions Treasury Agent</>
              )}
              {treasuryStatusFresh && (spendableBalance ?? 0) < seedPerMarket && (
                <> — need at least {fmtUct(seedPerMarket)} free on-chain</>
              )}
            </p>
          </div>
        )}
        <div className="space-y-4">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Market title / question"
            className="input-pro w-full rounded-lg px-4 py-3 text-sm"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="input-pro min-h-[80px] w-full rounded-lg px-4 py-3 text-sm"
          />
          <textarea
            value={criteria}
            onChange={e => setCriteria(e.target.value)}
            placeholder="Resolution criteria"
            className="input-pro min-h-[80px] w-full rounded-lg px-4 py-3 text-sm"
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
            className="btn-gold rounded-lg px-6 py-3 font-data text-xs uppercase tracking-wider"
          >
            Create market
          </button>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Active markets</h2>
        <div className="space-y-3">
          {activeMarkets.map(m => (
            <div key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.question}</p>
                <p className="text-xs text-slate-500">
                  {m.status}{m.seed_status && m.seed_status !== 'completed' && m.seed_status !== 'skipped' ? ` · seed ${m.seed_status}` : ''} · {timeRemaining(m.deadline)}
                </p>
              </div>
              {m.status === 'open' && (
                <button
                  onClick={() => platform.closeMarket(m.id).then(() => load({ trending: true, includePendingSeed: true }))}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                >
                  Close
                </button>
              )}
              <button
                onClick={() => platform.resolveMarket(m.id, 'YES').then(() => { load({ trending: true, includePendingSeed: true }); onToast('Resolved YES') })}
                className="chip chip-yes cursor-pointer px-3 py-1.5"
              >
                Resolve YES
              </button>
              <button
                onClick={() => platform.resolveMarket(m.id, 'NO').then(() => { load({ trending: true, includePendingSeed: true }); onToast('Resolved NO') })}
                className="chip chip-no cursor-pointer px-3 py-1.5"
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