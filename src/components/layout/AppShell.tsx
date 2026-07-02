import { Link, Outlet, useLocation } from 'react-router-dom'
import { displayName } from '../../lib/format'

type Props = {
  identity: { nametag?: string; directAddress?: string } | null
  balanceHuman: string
  isAdmin?: boolean
  onDisconnect: () => void
}

const NAV = [
  { to: '/', label: 'Markets' },
  { to: '/portfolio', label: 'Portfolio' },
]

export function AppShell({ identity, balanceHuman, isAdmin, onDisconnect }: Props) {
  const location = useLocation()

  function navActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[58px] max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] font-data text-xs font-bold text-[var(--color-gold)]">
              SP
            </span>
            <span className="font-data text-sm font-bold tracking-[0.12em] text-[var(--color-gold)]">
              SPHERE<span className="text-[var(--color-muted)]">_PREDICT</span>
            </span>
          </Link>

          <nav className="hidden items-center sm:flex">
            {NAV.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-4 py-4 font-data text-[11px] font-bold uppercase tracking-[0.08em] transition border-b-2 -mb-px ${
                  navActive(item.to)
                    ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                    : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className={`px-4 py-4 font-data text-[11px] font-bold uppercase tracking-[0.08em] transition border-b-2 -mb-px ${
                  navActive('/admin')
                    ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                    : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 sm:flex">
              <span className="live-dot" />
              <div className="text-right">
                <p className="font-data text-[11px] font-bold text-[var(--color-text)]">{displayName(identity)}</p>
                <p className="font-data text-[10px] text-[var(--color-gold)]">
                  {balanceHuman === '—' ? '—' : `${balanceHuman} UCT`}
                </p>
              </div>
            </div>
            <button
              onClick={onDisconnect}
              className="btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] font-bold uppercase tracking-wider"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--color-border)] py-4">
        <p className="text-center font-data text-[10px] tracking-wider text-[var(--color-muted)]">
          POWERED BY <span className="text-[var(--color-gold)]">UNICITY</span> · SPHERE TESTNET
        </p>
      </footer>
    </div>
  )
}