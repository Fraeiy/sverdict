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

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-surface)]">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[var(--color-surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-black">S</span>
            <span>Sphere Predict</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  location.pathname === '/admin' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <p className="font-medium text-white">{displayName(identity)}</p>
              <p className="text-xs text-slate-400">{balanceHuman === '—' ? '—' : `${balanceHuman} UCT`}</p>
            </div>
            <button
              onClick={onDisconnect}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}