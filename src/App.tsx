import { lazy, Suspense, useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ConnectScreen } from './components/layout/ConnectScreen'
import { Toast } from './components/ui/Toast'
import { useNotifications } from './hooks/useNotifications'
import { usePlatform } from './hooks/usePlatform'
import { useSphereConnect } from './hooks/useSphereConnect'
import { HomePage } from './pages/HomePage'
import { isMisconfiguredProduction } from './lib/config'

const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const MarketDetailPage = lazy(() => import('./pages/MarketDetailPage').then(m => ({ default: m.MarketDetailPage })))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center font-data text-sm text-[var(--color-muted)]">
      Loading…
    </div>
  )
}

export default function App() {
  const wallet = useSphereConnect()
  const platform = usePlatform(wallet.identity)
  const { unread: notificationUnread } = useNotifications(wallet.identity)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  if (isMisconfiguredProduction()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold">Production setup incomplete</h1>
          <p className="mt-3 text-sm text-slate-400">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.
          </p>
        </div>
      </div>
    )
  }

  if (!wallet.isConnected) {
    return <ConnectScreen wallet={wallet} />
  }

  if (wallet.isWalletLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Wallet locked. Unlock in Sphere and reconnect.</p>
          <button onClick={wallet.connect} className="btn-gold mt-4 rounded-lg px-6 py-3 font-data text-xs uppercase tracking-wider">
            Reconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <AppShell
              identity={wallet.identity}
              balanceHuman={wallet.balanceHuman}
              isAdmin={platform.isAdmin}
              notificationUnread={notificationUnread}
              onDisconnect={wallet.disconnect}
            />
          }
        >
          <Route index element={<HomePage />} />
          <Route
            path="markets/:id"
            element={
              <Suspense fallback={<PageFallback />}>
                <MarketDetailPage identity={wallet.identity} onToast={showToast} />
              </Suspense>
            }
          />
          <Route
            path="portfolio"
            element={
              <Suspense fallback={<PageFallback />}>
                <PortfolioPage
                  identity={wallet.identity}
                  treasuryAddress={platform.treasuryAddress}
                  userId={platform.user?.id}
                  wallet={wallet}
                  onToast={showToast}
                />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              platform.isAdmin
                ? (
                  <Suspense fallback={<PageFallback />}>
                    <AdminPage platform={platform} onToast={showToast} />
                  </Suspense>
                )
                : <Navigate to="/" replace />
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageFallback />}>
                <SettingsPage
                  identity={wallet.identity}
                  onDisconnect={wallet.disconnect}
                  onToast={showToast}
                />
              </Suspense>
            }
          />
        </Route>
      </Routes>

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </BrowserRouter>
  )
}