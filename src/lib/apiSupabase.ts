import { supabase } from './supabase'
import type { AppNotification, HistoryEntry, Market, Portfolio, User, UserPreferences } from './types'
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
  const payload = data as { error?: string } | null
  if (error) {
    let msg = payload?.error || error.message || 'Supabase function error'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json() as { error?: string }
        if (body?.error) msg = body.error
      } catch { /* use message above */ }
    }
    const hint = msg.includes('Not found') || error.message?.includes('404')
      ? ' — run npm run supabase:deploy'
      : ''
    throw new Error(`${msg}${hint}`)
  }
  if (payload?.error) throw new Error(payload.error)
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

export async function fetchMarkets(params?: {
  search?: string
  category?: string
  status?: string
  trending?: boolean
  includePendingSeed?: boolean
}) {
  if (supabase && !params?.search) {
    let q = supabase.from('markets').select('*')
    if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
    if (params?.category && params.category !== 'all') q = q.eq('category', params.category)
    if (params?.trending) q = q.order('trending_score', { ascending: false })
    else q = q.order('created_at', { ascending: false })
    const { data, error } = await q
    if (!error && data) {
      let markets = data
        .filter(m => params?.includePendingSeed || m.status !== 'pending_seed')
        .map(enrichMarket)
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
      includePendingSeed: params?.includePendingSeed,
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
  try {
    return await invoke<{ history: HistoryEntry[] }>('/history', { auth })
  } catch {
    // Production may run an older edge function without /history — use DB RPC instead.
    if (!supabase) throw new Error('History unavailable — redeploy platform edge function')
    const { data, error } = await supabase.rpc('get_wallet_history', {
      p_wallet_address: auth.walletAddress,
      p_nametag: auth.nametag ?? null,
      p_direct_address: auth.directAddress ?? null,
    })
    if (error) throw new Error(
      error.message.includes('get_wallet_history')
        ? 'Run migration 004_wallet_history_rpc.sql in Supabase SQL Editor'
        : error.message,
    )
    return { history: (Array.isArray(data) ? data : []) as HistoryEntry[] }
  }
}

export async function deposit(auth: AuthHeaders, amount: number, txReference?: string, paymentMemo?: string) {
  return invoke<{ portfolio: Portfolio }>('/deposits', { auth, payload: { amount, txReference, paymentMemo } })
}

export async function withdraw(auth: AuthHeaders, amount: number) {
  return invoke<{ portfolio: Portfolio }>('/withdrawals', { auth, payload: { amount } })
}

export async function placeTrade(
  auth: AuthHeaders,
  payload: { marketId: string; outcome: 'YES' | 'NO'; amount: number },
) {
  // Older deployed edge functions expect `side`; send both for compatibility.
  return invoke<{ portfolio: Portfolio }>('/trades', {
    auth,
    payload: { ...payload, side: payload.outcome },
  })
}

export type AdminTreasurySummary = {
  treasuryUserId: string
  seedPerMarket: number
  onChainBalance: number
  uctTokenCount: number
  largestCoin: number
  pendingWithdrawals: number
  pendingSeeds: number
  spendableAfterReserves: number
  canCreateMarket: boolean
  statusUpdatedAt: string | null
  statusFresh: boolean
  statusUsable: boolean
  statusAgeMinutes: number | null
  workerHealth: 'ok' | 'delayed' | 'stale' | 'unknown'
  source: string
}

export async function adminDashboard(auth: AuthHeaders) {
  return invoke<{
    treasury: AdminTreasurySummary
    withdrawals: {
      counts: Record<string, number>
      recent: Array<{
        id: string
        amount: number
        status: string
        created_at: string
        completed_at?: string | null
        tx_reference?: string | null
        failure_reason?: string | null
        users?: { nametag?: string | null; wallet_address?: string }
      }>
    }
    seeds: {
      counts: Record<string, number>
      recent: Array<{
        id: string
        question: string
        seed_liquidity: number
        seed_status: string
        seed_tx_reference?: string | null
        seed_failure_reason?: string | null
        created_at: string
        seed_completed_at?: string | null
      }>
    }
  }>('/admin/dashboard', { auth })
}

export async function adminTreasurySeed(auth: AuthHeaders) {
  return invoke<AdminTreasurySummary>('/admin/treasury-seed', { auth })
}

export async function adminMarketSeedQueue(auth: AuthHeaders) {
  return invoke<{
    counts: Record<string, number>
    recent: Array<{
      id: string
      question: string
      seed_liquidity: number
      seed_status: string
      seed_tx_reference?: string | null
      seed_failure_reason?: string | null
      created_at: string
      seed_completed_at?: string | null
    }>
  }>('/admin/market-seeds/queue', { auth })
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

export async function adminWithdrawalQueue(auth: AuthHeaders) {
  return invoke<{
    counts: Record<string, number>
    recent: Array<{
      id: string
      amount: number
      status: string
      created_at: string
      completed_at?: string | null
      tx_reference?: string | null
      failure_reason?: string | null
      users?: { nametag?: string | null; wallet_address?: string }
    }>
  }>('/admin/withdrawals/queue', { auth })
}

export async function adminListPendingWithdrawals(auth: AuthHeaders) {
  return invoke<{ withdrawals: unknown[] }>('/admin/withdrawals/pending', { auth })
}

export async function adminFulfillWithdrawal(auth: AuthHeaders, withdrawalId: string, txReference?: string) {
  return invoke(`/admin/withdrawals/fulfill/${withdrawalId}`, { auth, payload: { txReference } })
}

export async function fetchSettings(auth: AuthHeaders) {
  return invoke<{
    preferences: UserPreferences
    account: { nametag: string | null; wallet_address: string; public_key: string | null; is_admin: boolean }
  }>('/settings', { auth, payload: { _method: 'GET' } })
}

export async function updateSettings(auth: AuthHeaders, preferences: Partial<UserPreferences>) {
  return invoke<{ preferences: UserPreferences }>('/settings', { auth, payload: { preferences } })
}

export async function fetchNotifications(auth: AuthHeaders) {
  return invoke<{ notifications: AppNotification[]; unread: number }>('/notifications', { auth, payload: { _method: 'GET' } })
}

export async function markNotificationsRead(auth: AuthHeaders, opts: { all?: boolean; ids?: string[] }) {
  return invoke<{ ok: boolean }>('/notifications/read', { auth, payload: opts })
}

export function subscribeToMarkets(onUpdate: () => void) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('markets-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, () => onUpdate())
    .subscribe()
  return () => { supabase?.removeChannel(channel) }
}

export function subscribeToMarket(marketId: string, onUpdate: (market: Market) => void) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`market-${marketId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'markets', filter: `id=eq.${marketId}` },
      payload => {
        if (payload.new && typeof payload.new === 'object') {
          onUpdate(enrichMarket(payload.new as Market))
        }
      },
    )
    .subscribe()
  return () => { supabase?.removeChannel(channel) }
}

