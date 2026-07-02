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
    <div className="card card-glow p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Available margin</p>
          <p className="mt-2 font-data text-3xl font-bold text-[var(--color-gold)]">{fmtUct(availableBalance)}</p>
          <p className="mt-1 font-data text-[10px] text-[var(--color-muted)]">Deposit to trade · Queue withdrawal anytime</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('deposit'); setAmount('50') }}
            className="btn-gold rounded-lg px-5 py-2.5 font-data text-[11px] uppercase tracking-wider"
          >
            Deposit
          </button>
          <button
            onClick={() => { setMode('withdraw'); setAmount(String(availableBalance || '')) }}
            disabled={availableBalance <= 0}
            className="btn-ghost rounded-lg px-5 py-2.5 font-data text-[11px] uppercase tracking-wider disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>
      </div>

      {mode && (
        <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] p-5">
          <p className="font-data text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
            {mode === 'deposit' ? 'Deposit to portfolio' : 'Withdraw to Sphere wallet'}
          </p>
          {mode === 'deposit' ? (
            <p className="mb-4 mt-2 text-sm text-[var(--color-text-2)]">
              Approve a one-time Sphere transfer. Funds appear in your portfolio instantly.
            </p>
          ) : (
            <p className="mb-4 mt-2 text-sm text-[var(--color-text-2)]">
              Available: {fmtUct(availableBalance)}. The treasury agent sends from @sphere-predict automatically after you queue.
            </p>
          )}
          <input
            type="number"
            min="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="input-pro mb-4 w-full rounded-lg px-4 py-3 text-lg font-bold"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={loading}
              className={`flex-1 rounded-lg py-3 font-data text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${
                mode === 'deposit' ? 'btn-gold' : 'btn-ghost'
              }`}
            >
              {loading ? 'Processing…' : mode === 'deposit' ? 'Approve in Sphere' : 'Queue withdrawal'}
            </button>
            <button onClick={() => setMode(null)} className="btn-ghost rounded-lg px-4 py-3 font-data text-[10px]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}