import { BrandLogo } from '../ui/BrandLogo'

type Wallet = {
  isConnecting: boolean
  error: string | null
  connect: () => Promise<void>
}

type Props = {
  wallet: Wallet
  title: string
  description: string
}

export function ConnectPrompt({ wallet, title, description }: Props) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md items-center px-4 py-16">
      <div className="card card-glow w-full p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <BrandLogo size="md" />
        </div>
        <p className="label-caps mb-2 text-[var(--color-gold)]">{title}</p>
        <p className="text-sm leading-relaxed text-[var(--color-text-2)]">{description}</p>
        <button
          type="button"
          onClick={wallet.connect}
          disabled={wallet.isConnecting}
          className="btn-gold mt-6 w-full rounded-lg py-4 font-data text-sm uppercase tracking-wider disabled:opacity-50"
        >
          {wallet.isConnecting ? 'Connecting…' : 'Connect Sphere wallet'}
        </button>
        {wallet.error && (
          <p className="mt-4 font-data text-xs text-[var(--color-no)]">{wallet.error}</p>
        )}
      </div>
    </div>
  )
}