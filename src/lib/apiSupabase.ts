import { supabase } from './supabase'
import type { HistoryEntry, Market, Portfolio, User } from './types'
import type { AuthHeaders } from './apiRest'

function walletHeaders(auth?: AuthHeaders): Record<string, string> {
  if (!auth) return {}
  return {
    'X-Wallet-Address': auth.walletAddress,
    ...(auth.nametag ? { 'X-Wallet-Nametag': auth.nametag } : {}),
    ...(auth.directAddress ? { 'X-Wallet-Direct': auth.directAddress } : {}),
    ...(auth.publicKey ? { 'X-Wallet-Pubkey': auth.publicKey } : {}),
  }
}

async function invoke<T>(route: string, init?: { method?: string; payload?: unknown; auth?: AuthHeaders }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('platform', {
    method: 'POST',
    body: { route, payload: init?.payload ?? {} },
    headers: walletHeaders(init?.auth),
  })
  if (error) throw new Error(error.message || 'Supabase function error')
  if (data?.error) throw new Error(data.error)
  return data as T
}

function enrichMarket(m: Market): Market {
  const total = Number(m.yes_pool || 0) + Number(m.no_pool || 0)
  const yes_price = total ? Number(m.yes_pool || 0) / total : 0.5
  const yes_probability = yes_price
  const no_probability = 1 - yes_price
  return {
    ...m,
    title: m.title || m.question,
    resolution_date: m.resolution_date || m.deadline,
    resolved_outcome: m.resolved_outcome || m.resolution,
    yes_price,
    no_price: 1 - yes_price,
    yes_probability,
    no_probability,
  }
}

export async function fetchTreasury() {
  return invoke<{ address: string }>('/treasury')
}

export async function authenticate(auth: AuthHeaders) {
  return invoke<{ user: User; portfolio: Portfolio }>('/auth', { auth, payload: auth })
}

export async function fetchMarkets(params?: { search?: string; category?: string; status?: string; trending?: boolean }) {
  if (supabase && !params?.search) {
    let q = supabase.from('markets').select('*')
    if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
    if (params?.category && params.category !== 'all') q = q.eq('category', params.category)
    if (params?.trending) q = q.order('trending_score', { ascending: false })
    else q = q.order('created_at', { ascending: false })
    const { data, error } = await q
    if (!error && data) {
      let markets = data.map(enrichMarket)
      if (params?.search) {
        const s = params.search.toLowerCase()
        markets = markets.filter(m => m.question.toLowerCase().includes(s))
      }
      return { markets }
    }
  }
  return invoke<{ markets: Market[] }>('/markets', {
    payload: {
      search: params?.search,
      category: params?.category,
      status: params?.status,
      trending: params?.trending,
    },
  })
}

export async function fetchMarket(id: string) {
  if (supabase) {
    const { data, error } = await supabase.from('markets').select('*').eq('id', id).single()
    if (!error && data) return { market: enrichMarket(data as Market) }
  }
  return invoke<{ market: Market }>(`/markets/${id}`)
}

export async function fetchPortfolio(auth: AuthHeaders) {
  return invoke<Portfolio>('/portfolio', { auth })
}

export async function fetchHistory(auth: AuthHeaders) {
  return invoke<{ history: HistoryEntry[] }>('/history', { auth })
}

export async function deposit(auth: AuthHeaders, amount: number, txReference?: string) {
  return invoke<{ portfolio: Portfolio }>('/deposits', { auth, payload: { amount, txReference } })
}

export async function withdraw(auth: AuthHeaders, amount: number) {
  return invoke<{ portfolio: Portfolio }>('/withdrawals', { auth, payload: { amount } })
}

export async function placeTrade(
  auth: AuthHeaders,
  payload: { marketId: string; outcome: 'YES' | 'NO'; amount: number },
) {
  return invoke<{ portfolio: Portfolio }>('/trades', { auth, payload })
}

export async function adminCreateMarket(
  auth: AuthHeaders,
  payload: { question: string; description?: string; resolutionCriteria?: string; category: string; daysOpen: number },
) {
  return invoke<{ market: Market }>('/admin/markets', { auth, payload })
}

export async function adminCloseMarket(auth: AuthHeaders, marketId: string) {
  return invoke<{ market: Market }>(`/admin/markets/close/${marketId}`, { auth })
}

export async function adminResolveMarket(auth: AuthHeaders, marketId: string, resolution: 'YES' | 'NO') {
  return invoke(`/admin/markets/resolve/${marketId}`, { auth, payload: { resolution } })
}

export async function adminListPendingWithdrawals(auth: AuthHeaders) {
  return invoke<{ withdrawals: unknown[] }>('/admin/withdrawals/pending', { auth })
}

export async function adminFulfillWithdrawal(auth: AuthHeaders, withdrawalId: string, txReference?: string) {
  return invoke(`/admin/withdrawals/fulfill/${withdrawalId}`, { auth, payload: { txReference } })
}

export function subscribeToMarkets(onUpdate: () => void) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('markets-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, () => onUpdate())
    .subscribe()
  return () => { supabase?.removeChannel(channel) }
}

