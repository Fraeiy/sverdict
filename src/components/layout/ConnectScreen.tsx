import { useState } from 'react'

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
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <h1 className="text-2xl font-bold">Sphere Predict</h1>
          <p className="mt-2 text-slate-400">Connecting to your Sphere wallet…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--color-surface-2)] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-black">
            S
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Trade the future</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Connect once with Sphere. Deposit margin to your portfolio, trade instantly, withdraw anytime.
          </p>
        </div>

        {!showMethods ? (
          <button
            onClick={() => setShowMethods(true)}
            disabled={wallet.isConnecting}
            className="w-full rounded-2xl bg-blue-600 py-4 text-base font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Continue with Sphere
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={wallet.connect}
              disabled={wallet.isConnecting}
              className="w-full rounded-2xl bg-blue-600 py-4 font-semibold transition hover:bg-blue-500"
            >
              {wallet.isConnecting ? 'Connecting…' : 'Connect wallet'}
            </button>
            {wallet.extensionInstalled && (
              <button
                onClick={wallet.connectViaExtension}
                className="w-full rounded-2xl border border-white/10 py-4 font-medium transition hover:bg-white/5"
              >
                Use browser extension
              </button>
            )}
            <button onClick={() => setShowMethods(false)} className="w-full py-2 text-sm text-slate-500">
              Back
            </button>
          </div>
        )}

        {wallet.error && <p className="mt-4 text-center text-sm text-red-400">{wallet.error}</p>}

        <div className="mt-8 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
          <div className="rounded-xl bg-white/5 p-3">Portfolio margin</div>
          <div className="rounded-xl bg-white/5 p-3">Instant trades</div>
          <div className="rounded-xl bg-white/5 p-3">Easy withdraw</div>
        </div>
      </div>
    </div>
  )
}