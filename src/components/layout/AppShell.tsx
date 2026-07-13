import { Link, Outlet, useLocation } from 'react-router-dom'
import { BrandLogo } from '../ui/BrandLogo'
import { NavIcon } from '../ui/NavIcon'
import { displayName } from '../../lib/format'

type Props = {
  identity: { nametag?: string; directAddress?: string } | null
  balanceHuman: string
  isAdmin?: boolean
  notificationUnread?: number
  onDisconnect: () => void
}

const NAV = [
  { to: '/', label: 'Markets', icon: 'markets' as const },
  { to: '/portfolio', label: 'Portfolio', icon: 'portfolio' as const },
  { to: '/settings', label: 'Settings', icon: 'settings' as const },
]

export function AppShell({ identity, balanceHuman, isAdmin, notificationUnread = 0, onDisconnect }: Props) {
  const location = useLocation()

  function navActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[58px] max-w-6xl items-center gap-6 px-4">
          <Link to="/">
            <BrandLogo />
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
                <span className="relative inline-flex items-center gap-1.5">
                  {item.label}
                  {item.to === '/settings' && notificationUnread > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-gold)] px-1 font-data text-[9px] font-bold text-[#111]">
                      {notificationUnread > 9 ? '9+' : notificationUnread}
                    </span>
                  )}
                </span>
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

      <main className="flex-1 pb-[4.5rem] sm:pb-0">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-6xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {NAV.map(item => {
            const active = navActive(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2.5 font-data text-[9px] font-bold uppercase tracking-wider transition ${
                  active ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]'
                }`}
              >
                {item.to === '/settings' && notificationUnread > 0 && (
                  <span className="absolute right-[22%] top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-gold)] px-0.5 text-[8px] font-bold text-[#111]">
                    {notificationUnread > 9 ? '9+' : notificationUnread}
                  </span>
                )}
                <NavIcon name={item.icon} active={active} />
                <span>{item.label}</span>
              </Link>
            )
          })}
          {isAdmin && (
            <Link
              to="/admin"
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2.5 font-data text-[9px] font-bold uppercase tracking-wider transition ${
                navActive('/admin') ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]'
              }`}
            >
              <NavIcon name="admin" active={navActive('/admin')} />
              <span>Admin</span>
            </Link>
          )}
        </div>
      </nav>

      <footer className="hidden border-t border-[var(--color-border)] py-4 sm:block">
        <p className="text-center font-data text-[10px] tracking-wider text-[var(--color-muted)]">
          POWERED BY <span className="text-[var(--color-gold)]">UNICITY</span> · SPHERE TESTNET
        </p>
      </footer>
    </div>
  )
}