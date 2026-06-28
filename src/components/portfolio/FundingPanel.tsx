import { useState } from 'react'
import { fmtUct } from '../../lib/format'

type Props = {
  availableBalance: number
  onDeposit: (amount: number) => Promise<void>
  onWithdraw: (amount: number) => Promise<void>
}

export function FundingPanel({ availableBalance, onDeposit, onWithdraw }: Props) {
  const [mode, setMode] = useState<'deposit' | 'withdraw' | null>(null)
  const [amount, setAmount] = useState('50')
  const [loading, setLoading] = useState(false)

  async function submit() {
    const n = parseFloat(amount)
    if (!n || n <= 0) return
    setLoading(true)
    try {
      if (mode === 'deposit') await onDeposit(n)
      else if (mode === 'withdraw') await onWithdraw(n)
      setMode(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-blue-600/10 to-indigo-600/5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Portfolio balance</p>
          <p className="mt-1 text-3xl font-bold">{fmtUct(availableBalance)}</p>
          <p className="mt-1 text-xs text-slate-500">Deposit margin to trade · Withdraw profits anytime</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('deposit'); setAmount('50') }}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-blue-500"
          >
            Deposit
          </button>
          <button
            onClick={() => { setMode('withdraw'); setAmount(String(availableBalance || '')) }}
            disabled={availableBalance <= 0}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>
      </div>

      {mode && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-[var(--color-surface-2)] p-5">
          <p className="mb-3 font-medium">
            {mode === 'deposit' ? 'Deposit to portfolio' : 'Withdraw to Sphere wallet'}
          </p>
          {mode === 'deposit' ? (
            <p className="mb-4 text-sm text-slate-400">
              Approve a one-time Sphere transfer. Funds appear in your portfolio instantly — no addresses to copy.
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-400">
              Available: {fmtUct(availableBalance)}
            </p>
          )}
          <input
            type="number"
            min="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="mb-4 w-full rounded-xl border border-white/10 bg-[var(--color-surface-3)] px-4 py-3 text-lg font-semibold outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={loading}
              className={`flex-1 rounded-xl py-3 font-semibold transition disabled:opacity-50 ${
                mode === 'deposit' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-white/10 hover:bg-white/15'
              }`}
            >
              {loading ? 'Processing…' : mode === 'deposit' ? 'Approve in Sphere' : 'Withdraw'}
            </button>
            <button onClick={() => setMode(null)} className="rounded-xl px-4 py-3 text-slate-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}