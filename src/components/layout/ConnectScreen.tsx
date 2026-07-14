import { useState } from 'react'
import { BrandLogo } from '../ui/BrandLogo'
import { BRAND_LOGO, BRAND_NAME } from '../../lib/brand'

type Wallet = {
  isAutoConnecting: boolean
  isConnecting: boolean
  error: string | null
  extensionInstalled: boolean
  connect: () => Promise<void>
  connectViaExtension: () => Promise<void>
}

export function ConnectScreen({ wallet }: { wallet: Wallet }) {
  const [showMethods, setShowMethods] = useState(false)

  if (wallet.isAutoConnecting) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <img src={BRAND_LOGO} alt={BRAND_NAME} className="mx-auto mb-6 h-14 w-14 rounded-lg object-cover" />
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold)] border-t-transparent" />
          <p className="font-data text-sm font-bold tracking-[0.08em] text-[var(--color-gold)]">{BRAND_NAME}</p>
          <p className="mt-3 font-data text-xs text-[var(--color-text-2)]">Establishing wallet connection…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="card card-glow w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <p className="label-caps mb-2">Unicity · Sphere</p>
          <h1 className="text-3xl font-bold tracking-tight">Trade the future</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-2)]">
            Deposit margin, execute instant positions, and withdraw on your terms — all native to Sphere.
          </p>
        </div>

        {!showMethods ? (
          <button
            onClick={() => setShowMethods(true)}
            disabled={wallet.isConnecting}
            className="btn-gold w-full rounded-lg py-4 font-data text-sm uppercase tracking-wider disabled:opacity-50"
          >
            Continue with Sphere
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={wallet.connect}
              disabled={wallet.isConnecting}
              className="btn-gold w-full rounded-lg py-4 font-data text-sm uppercase tracking-wider"
            >
              {wallet.isConnecting ? 'Connecting…' : 'Connect wallet'}
            </button>
            {wallet.extensionInstalled && (
              <button
                onClick={wallet.connectViaExtension}
                className="btn-ghost w-full rounded-lg py-4 font-data text-xs uppercase tracking-wider"
              >
                Browser extension
              </button>
            )}
            <button onClick={() => setShowMethods(false)} className="w-full py-2 font-data text-[10px] text-[var(--color-muted)]">
              ← Back
            </button>
          </div>
        )}

        {wallet.error && <p className="mt-4 text-center font-data text-xs text-[var(--color-no)]">{wallet.error}</p>}

        <div className="mt-8 grid grid-cols-3 gap-2">
          {['Margin', 'Instant', 'Withdraw'].map(label => (
            <div key={label} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] p-3 text-center">
              <p className="font-data text-[9px] font-bold uppercase tracking-wider text-[var(--color-gold)]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}