import type { Market, Notification, Portfolio, User } from './types'

const API_BASE = import.meta.env.VITE_MARKET_API_URL
  ? String(import.meta.env.VITE_MARKET_API_URL).replace(/\/$/, '').replace(/\/api$/, '') + '/api'
  : '/api'

export interface AuthHeaders {
  walletAddress: string
  nametag?: string
  publicKey?: string
}

function authHeaders(auth: AuthHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Wallet-Address': auth.walletAddress,
    ...(auth.nametag ? { 'X-Wallet-Nametag': auth.nametag } : {}),
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

export async function fetchNotifications(auth: AuthHeaders) {
  return request<{ notifications: Notification[] }>('/notifications', { headers: authHeaders(auth) })
}

export async function markNotificationRead(auth: AuthHeaders, id: string) {
  return request(`/notifications/${id}/read`, { method: 'POST', headers: authHeaders(auth) })
}

export async function markAllNotificationsRead(auth: AuthHeaders) {
  return request('/notifications/read-all', { method: 'POST', headers: authHeaders(auth) })
}

export async function deposit(auth: AuthHeaders, amount: number, txReference?: string) {
  return request<{ deposit: unknown; portfolio: Portfolio }>('/deposits', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ amount, txReference }),
  })
}

export async function withdraw(auth: AuthHeaders, amount: number) {
  return request<{ withdrawal: unknown; portfolio: Portfolio }>('/withdrawals', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ amount }),
  })
}

export async function placeTrade(
  auth: AuthHeaders,
  payload: { marketId: string; side: 'YES' | 'NO'; amount: number; signature?: string; signedMessage?: string },
) {
  return request<{ trade: unknown; portfolio: Portfolio }>('/trades', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(payload),
  })
}

export async function adminCreateMarket(auth: AuthHeaders, payload: { question: string; category: string; daysOpen: number }) {
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

export async function adminListDeposits(auth: AuthHeaders) {
  return request<{ deposits: unknown[] }>('/admin/deposits', { headers: authHeaders(auth) })
}

export async function adminListWithdrawals(auth: AuthHeaders) {
  return request<{ withdrawals: unknown[] }>('/admin/withdrawals', { headers: authHeaders(auth) })
}

export function subscribeToMarkets(_onUpdate: () => void) {
  return () => {}
}

export function subscribeToNotifications(_userId: string, _onInsert: (n: Notification) => void) {
  return () => {}
}