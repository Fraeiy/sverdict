import type { AppNotification, HistoryEntry, Market, Portfolio, User, UserPreferences } from './types'
import { loadCachedPreferences, normalizePreferences, cachePreferences } from './userSettings'

const API_BASE = import.meta.env.VITE_MARKET_API_URL
  ? String(import.meta.env.VITE_MARKET_API_URL).replace(/\/$/, '').replace(/\/api$/, '') + '/api'
  : '/api'

export interface AuthHeaders {
  walletAddress: string
  nametag?: string
  directAddress?: string
  publicKey?: string
}

function authHeaders(auth: AuthHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Wallet-Address': auth.walletAddress,
    ...(auth.nametag ? { 'X-Wallet-Nametag': auth.nametag } : {}),
    ...(auth.directAddress ? { 'X-Wallet-Direct': auth.directAddress } : {}),
    ...(auth.publicKey ? { 'X-Wallet-Pubkey': auth.publicKey } : {}),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed')
  return data as T
}

export async function fetchTreasury() {
  return request<{ address: string }>('/treasury')
}

export async function authenticate(auth: AuthHeaders) {
  return request<{ user: User; portfolio: Portfolio }>('/auth', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(auth),
  })
}

export async function fetchMarkets(params?: { search?: string; category?: string; status?: string; trending?: boolean }) {
  const q = new URLSearchParams()
  if (params?.search) q.set('search', params.search)
  if (params?.category) q.set('category', params.category)
  if (params?.status) q.set('status', params.status)
  if (params?.trending) q.set('trending', '1')
  const suffix = q.toString() ? `?${q}` : ''
  return request<{ markets: Market[] }>(`/markets${suffix}`)
}

export async function fetchMarket(id: string) {
  return request<{ market: Market }>(`/markets/${id}`)
}

export async function fetchPortfolio(auth: AuthHeaders) {
  return request<Portfolio>('/portfolio', { headers: authHeaders(auth) })
}

export async function fetchHistory(auth: AuthHeaders) {
  return request<{ history: HistoryEntry[] }>('/history', { headers: authHeaders(auth) })
}

export async function deposit(auth: AuthHeaders, amount: number, txReference?: string, paymentMemo?: string) {
  return request<{ portfolio: Portfolio }>('/deposits', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ amount, txReference, paymentMemo }),
  })
}

export async function withdraw(auth: AuthHeaders, amount: number) {
  return request<{ portfolio: Portfolio }>('/withdrawals', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ amount }),
  })
}

export async function placeTrade(
  auth: AuthHeaders,
  payload: { marketId: string; outcome: 'YES' | 'NO'; amount: number },
) {
  return request<{ portfolio: Portfolio }>('/trades', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ ...payload, side: payload.outcome }),
  })
}

export async function adminTreasurySeed(_auth: AuthHeaders) {
  return {
    treasuryUserId: '',
    seedPerMarket: 100,
    onChainBalance: 0,
    uctTokenCount: 0,
    largestCoin: 0,
    pendingWithdrawals: 0,
    pendingSeeds: 0,
    spendableAfterReserves: 0,
    canCreateMarket: false,
    statusUpdatedAt: null,
    statusFresh: false,
    statusUsable: false,
    statusAgeMinutes: null,
    workerHealth: 'unknown' as const,
    source: 'rest',
  }
}

export async function adminMarketSeedQueue(_auth: AuthHeaders) {
  return { counts: {}, recent: [] }
}

export async function adminCreateMarket(
  auth: AuthHeaders,
  payload: { question: string; description?: string; resolutionCriteria?: string; category: string; daysOpen: number },
) {
  return request<{ market: Market }>('/admin/markets', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(payload),
  })
}

export async function adminCloseMarket(auth: AuthHeaders, marketId: string) {
  return request<{ market: Market }>(`/admin/markets/close/${marketId}`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: '{}',
  })
}

export async function adminResolveMarket(auth: AuthHeaders, marketId: string, resolution: 'YES' | 'NO') {
  return request(`/admin/markets/resolve/${marketId}`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ resolution }),
  })
}

export async function adminWithdrawalQueue(_auth: AuthHeaders) {
  return { counts: { submitted: 0, processing: 0, completed: 0, failed: 0 }, recent: [] }
}

export async function adminListPendingWithdrawals(auth: AuthHeaders) {
  return request<{ withdrawals: unknown[] }>('/admin/withdrawals/pending', { headers: authHeaders(auth) })
}

export async function adminFulfillWithdrawal(auth: AuthHeaders, withdrawalId: string, txReference?: string) {
  return request(`/admin/withdrawals/fulfill/${withdrawalId}`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ txReference }),
  })
}

export async function fetchSettings(auth: AuthHeaders) {
  const preferences = loadCachedPreferences()
  return {
    preferences,
    account: {
      nametag: auth.nametag ?? null,
      wallet_address: auth.walletAddress,
      public_key: auth.publicKey ?? null,
      is_admin: false,
    },
  }
}

export async function updateSettings(_auth: AuthHeaders, preferences: Partial<UserPreferences>) {
  const merged = normalizePreferences({ ...loadCachedPreferences(), ...preferences })
  cachePreferences(merged)
  return { preferences: merged }
}

export async function fetchNotifications(_auth: AuthHeaders) {
  return { notifications: [] as AppNotification[], unread: 0 }
}

export async function markNotificationsRead(_auth: AuthHeaders, _opts: { all?: boolean; ids?: string[] }) {
  return { ok: true }
}

export function subscribeToMarkets(_onUpdate: () => void) {
  return () => {}
}

export function subscribeToMarket(_marketId: string, _onUpdate: (market: import('./types').Market) => void) {
  return () => {}
}