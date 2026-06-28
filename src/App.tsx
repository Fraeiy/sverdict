import { useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ConnectScreen } from './components/layout/ConnectScreen'
import { Toast } from './components/ui/Toast'
import { usePlatform } from './hooks/usePlatform'
import { useSphereConnect } from './hooks/useSphereConnect'
import { AdminPage } from './pages/AdminPage'
import { HomePage } from './pages/HomePage'
import { MarketDetailPage } from './pages/MarketDetailPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { isMisconfiguredProduction } from './lib/config'

export default function App() {
  const wallet = useSphereConnect()
  const platform = usePlatform(wallet.identity)
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
          <button onClick={wallet.connect} className="mt-4 rounded-xl bg-blue-600 px-6 py-3 font-semibold">
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
              onDisconnect={wallet.disconnect}
            />
          }
        >
          <Route index element={<HomePage />} />
          <Route
            path="markets/:id"
            element={
              <MarketDetailPage
                identity={wallet.identity}
                wallet={wallet}
                treasuryAddress={platform.treasuryAddress}
                onToast={showToast}
              />
            }
          />
          <Route path="portfolio" element={<PortfolioPage identity={wallet.identity} />} />
          <Route
            path="admin"
            element={
              platform.isAdmin
                ? <AdminPage identity={wallet.identity} onToast={showToast} />
                : <Navigate to="/" replace />
            }
          />
        </Route>
      </Routes>

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </BrowserRouter>
  )
}