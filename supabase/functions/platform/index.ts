import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertDepositMemo,
  buildDepositMemo,
  buildSeedMemo,
  buildSettleMemo,
  buildStakeMemo,
  buildWithdrawMemo,
} from './paymentMemos.ts'

const MARKET_SEED_LIQUIDITY_UCT = Number(Deno.env.get('MARKET_SEED_LIQUIDITY_UCT') ?? 100)

/** GitHub schedule is best-effort — real gaps are often 60–120+ min between runs. */
const WORKER_FRESH_MS = 20 * 60_000
const WORKER_USABLE_MS = 180 * 60_000

function treasuryStatusMeta(updatedAt: string | null | undefined) {
  const statusAgeMs = updatedAt ? Date.now() - new Date(String(updatedAt)).getTime() : null
  const statusFresh = statusAgeMs != null && statusAgeMs < WORKER_FRESH_MS
  const statusUsable = statusAgeMs != null && statusAgeMs < WORKER_USABLE_MS
  const workerHealth = statusAgeMs == null
    ? 'unknown'
    : statusAgeMs < WORKER_FRESH_MS
      ? 'ok'
      : statusAgeMs < 120 * 60_000
        ? 'delayed'
        : 'stale'
  return {
    statusAgeMs,
    statusAgeMinutes: statusAgeMs != null ? Math.round(statusAgeMs / 60_000) : null,
    statusFresh,
    statusUsable,
    workerHealth,
  }
}

const DEFAULT_PREFERENCES = {
  defaultStake: 25,
  confirmBeforeTrade: true,
  dmOnWin: true,
  dmOnWithdrawal: true,
}

function normalizePreferences(raw: unknown) {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const stake = Number(p.defaultStake)
  return {
    defaultStake: stake > 0 && stake <= 10_000 ? stake : DEFAULT_PREFERENCES.defaultStake,
    confirmBeforeTrade: p.confirmBeforeTrade !== false,
    dmOnWin: p.dmOnWin !== false,
    dmOnWithdrawal: p.dmOnWithdrawal !== false,
  }
}

function userWantsDm(prefs: unknown, key: 'dmOnWin' | 'dmOnWithdrawal') {
  const p = normalizePreferences(prefs)
  return p[key] !== false
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-wallet-nametag, x-wallet-direct, x-wallet-pubkey',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const ADMIN_WALLETS = new Set([
  'sphere-predict',
  'direct://00003db7de43899584dd9a5306096750f32e4c06b201c8e99adf4b8e34e4f2d94dde41318434',
])

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function normalizeWallet(addr: string) {
  if (!addr) return ''
  const s = String(addr).trim()
  if (s.startsWith('@')) return s.slice(1).toLowerCase()
  return s.toUpperCase()
}

function isAdminWallet(wallet?: string | null) {
  if (!wallet) return false
  const lower = String(wallet).trim().toLowerCase().replace(/^@/, '')
  const upper = String(wallet).trim().toUpperCase()
  return ADMIN_WALLETS.has(lower) || ADMIN_WALLETS.has(upper)
}

function yesPrice(market: { yes_pool: number; no_pool: number }) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  if (!total) return 0.5
  return Number(market.yes_pool || 0) / total
}

function potentialPayout(position: { side: string; quantity: number; cost_basis: number }, market: { yes_pool: number; no_pool: number }) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  const pool = position.side === 'YES' ? Number(market.yes_pool || 0) : Number(market.no_pool || 0)
  if (!total || !pool) return position.cost_basis
  return (position.quantity / pool) * total
}

function currentPositionValue(position: { side: string; quantity: number; cost_basis: number; status: string }, market: { yes_pool: number; no_pool: number }) {
  if (position.status !== 'open') return Number(position.cost_basis || 0)
  return potentialPayout(position, market)
}

type WalletAuth = { walletAddress: string; nametag?: string; directAddress?: string; publicKey?: string }

function userAuthKeys(auth: WalletAuth) {
  const keys = new Set<string>()
  for (const raw of [auth.walletAddress, auth.nametag, auth.directAddress]) {
    if (!raw) continue
    keys.add(normalizeWallet(raw))
  }
  return keys
}

function userMatchesAuth(u: { wallet_address: string; nametag?: string | null }, auth: WalletAuth) {
  const keys = userAuthKeys(auth)
  if (keys.has(normalizeWallet(u.wallet_address))) return true
  if (u.nametag && keys.has(normalizeWallet(u.nametag))) return true
  return false
}

async function findOrCreateUser(db: SupabaseClient, auth: WalletAuth) {
  const { data: users } = await db.from('users').select('*')
  let user = (users || []).find(u => userMatchesAuth(u, auth))
  if (!user) {
    const wallet = auth.directAddress || auth.nametag || auth.walletAddress
    const { data, error } = await db.from('users').insert({
      wallet_address: wallet,
      nametag: auth.nametag || null,
      public_key: auth.publicKey || null,
      is_admin: isAdminWallet(auth.walletAddress) || isAdminWallet(auth.nametag) || isAdminWallet(auth.directAddress),
    }).select().single()
    if (error) throw error
    user = data
    const { error: balInitErr } = await db.from('balances').insert({ user_id: user.id, available_balance: 0 })
    if (balInitErr && !balInitErr.message.includes('duplicate')) {
      console.error('balance init failed:', balInitErr.message)
    }
  } else {
    const updates: Record<string, string | null> = {}
    if (auth.nametag && !user.nametag) updates.nametag = auth.nametag
    if (auth.publicKey && !user.public_key) updates.public_key = auth.publicKey
    if (Object.keys(updates).length) {
      await db.from('users').update(updates).eq('id', user.id)
      user = { ...user, ...updates }
    }
  }
  return user
}

async function getBalance(db: SupabaseClient, userId: string) {
  const { data } = await db.from('balances').select('available_balance').eq('user_id', userId).single()
  return Number(data?.available_balance || 0)
}

async function setBalance(db: SupabaseClient, userId: string, amount: number) {
  const { error } = await db.from('balances').upsert({
    user_id: userId,
    available_balance: amount,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

async function notify(db: SupabaseClient, userId: string, type: string, title: string, body: string, metadata: Record<string, unknown> = {}) {
  await db.from('notifications').insert({ user_id: userId, type, title, body, metadata })
}

function isTreasuryUser(u: { nametag?: string | null; wallet_address?: string }) {
  return (u.nametag || '').replace(/^@/, '').toLowerCase() === 'sphere-predict'
    || isAdminWallet(u.nametag)
    || isAdminWallet(u.wallet_address)
}

function resolveTreasuryUserId(
  users: { id: string; nametag?: string | null; wallet_address?: string; is_admin?: boolean }[],
  fallbackUserId: string,
) {
  const treasury = users.find(isTreasuryUser)
  return treasury?.id || fallbackUserId
}

/** @sphere-predict user row (on-chain treasury; internal ledger not used for seeds). */
async function ensureTreasuryUser(db: SupabaseClient) {
  const { data: users } = await db.from('users').select('id, nametag, wallet_address, is_admin')
  let treasury = (users || []).find(isTreasuryUser)
  if (!treasury) {
    const { data, error } = await db.from('users').insert({
      wallet_address: '@sphere-predict',
      nametag: 'sphere-predict',
      is_admin: true,
    }).select('id, nametag, wallet_address, is_admin').single()
    if (error) throw error
    treasury = data
    const { error: balErr } = await db.from('balances').insert({ user_id: treasury.id, available_balance: 0 })
    if (balErr && !balErr.message.includes('duplicate')) throw balErr
  }
  return treasury
}

function marketSeedAmounts() {
  const seedTotal = MARKET_SEED_LIQUIDITY_UCT
  if (!seedTotal || seedTotal <= 0) return { seedTotal: 0, seedPerSide: 0 }
  return { seedTotal, seedPerSide: seedTotal / 2 }
}

async function sumPendingWithdrawals(db: SupabaseClient) {
  const { data } = await db.from('withdrawals').select('amount').in('status', ['submitted', 'processing'])
  return (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
}

async function sumPendingSeeds(db: SupabaseClient) {
  const { data } = await db.from('markets').select('seed_liquidity').in('seed_status', ['pending', 'processing'])
  return (data || []).reduce((sum, row) => sum + Number(row.seed_liquidity || 0), 0)
}

async function getTreasuryOnChainStatus(db: SupabaseClient) {
  const { data } = await db.from('treasury_status').select('*').eq('id', 1).maybeSingle()
  return data
}

function dmRecipientFromUser(user: { nametag?: string | null; wallet_address?: string | null } | null | undefined) {
  if (!user) return null
  const tag = String(user.nametag || '').trim().replace(/^@/, '')
  if (tag) return `@${tag}`
  const wallet = String(user.wallet_address || '').trim()
  return wallet || null
}

function formatMarketWinDm(payout: number, question: string) {
  const q = String(question || 'market')
  const short = q.length > 80 ? `${q.slice(0, 77)}...` : q
  return `Sphere Predict: You won! ${payout.toFixed(2)} UCT credited to your portfolio for "${short}". Bet again or withdraw anytime.`
}

function formatWithdrawalSentDm(amount: number, txReference?: string) {
  const ref = txReference ? ` Ref: ${txReference}` : ''
  return `Sphere Predict: ${amount.toFixed(2)} UCT sent to your Sphere wallet.${ref}`
}

async function queueOutboundDm(
  db: SupabaseClient,
  opts: {
    userId: string
    recipient: string | null
    content: string
    kind: 'market_win' | 'withdrawal_sent' | 'market_lost'
    metadata?: Record<string, unknown>
  },
) {
  const { userId, recipient, content, kind, metadata = {} } = opts
  if (!recipient) {
    await db.from('outbound_dms').insert({
      user_id: userId,
      recipient: 'unknown',
      content,
      kind,
      status: 'skipped',
      failure_reason: 'User has no nametag or wallet address for Sphere DM',
      metadata,
    })
    return
  }
  await db.from('outbound_dms').insert({
    user_id: userId,
    recipient,
    content,
    kind,
    status: 'pending',
    metadata,
  })
}

async function getPortfolio(db: SupabaseClient, userId: string) {
  const [{ data: positions }, { data: markets }, available] = await Promise.all([
    db.from('positions').select('*').eq('user_id', userId),
    db.from('markets').select('*'),
    getBalance(db, userId),
  ])

  const marketMap = new Map((markets || []).map(m => [String(m.id), m]))
  const open = (positions || []).filter(p => p.status === 'open')
  const settled = (positions || []).filter(p => p.status === 'settled')

  let unrealizedPnl = 0
  const openWithValue = open.map(p => {
    const market = marketMap.get(String(p.market_id))
    const currentValue = market ? currentPositionValue(p, market) : Number(p.cost_basis || 0)
    const payout = market ? potentialPayout(p, market) : Number(p.cost_basis || 0)
    const pnl = currentValue - Number(p.cost_basis || 0)
    unrealizedPnl += pnl
    return {
      ...p,
      outcome: p.side,
      shares: Number(p.shares ?? p.quantity),
      stake_amount: Number(p.stake_amount ?? p.cost_basis),
      market,
      current_value: currentValue,
      unrealized_pnl: pnl,
      potential_payout: payout,
    }
  })

  const resolvedPositions = settled.map(p => {
    const stake = Number(p.stake_amount ?? p.cost_basis ?? 0)
    const payout = Number(p.payout ?? 0)
    const pnl = p.pnl != null && p.pnl !== '' ? Number(p.pnl) : payout - stake
    return {
      ...p,
      outcome: p.side,
      shares: Number(p.shares ?? p.quantity),
      stake_amount: stake,
      payout,
      pnl,
      market: marketMap.get(String(p.market_id)),
    }
  })

  const realizedPnl = resolvedPositions.reduce((s, p) => s + Number(p.pnl || 0), 0)
  const totalStaked = openWithValue.reduce((s, p) => s + Number(p.stake_amount ?? p.cost_basis), 0)
  const estimatedValue = openWithValue.reduce((s, p) => s + Number(p.current_value || 0), 0)
  const positionsValue = estimatedValue

  return {
    available_balance: available,
    total_portfolio_value: available + positionsValue,
    total_staked: totalStaked,
    estimated_value: estimatedValue,
    unrealized_pnl: unrealizedPnl,
    realized_pnl: realizedPnl,
    total_pnl: unrealizedPnl + realizedPnl,
    open_positions: openWithValue,
    resolved_positions: resolvedPositions,
  }
}

async function listMarkets(db: SupabaseClient, params: {
  search?: string
  category?: string
  status?: string
  trending?: boolean
  includePendingSeed?: boolean
}) {
  let q = db.from('markets').select('*')
  if (params.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params.category && params.category !== 'all') q = q.eq('category', params.category)
  const { data, error } = await q
  if (error) throw error
  let markets = params.includePendingSeed
    ? (data || [])
    : (data || []).filter(m => m.status !== 'pending_seed')
  if (params.search) {
    const s = params.search.toLowerCase()
    markets = markets.filter(m =>
      m.question.toLowerCase().includes(s) ||
      (m.description || '').toLowerCase().includes(s) ||
      (m.category || '').toLowerCase().includes(s),
    )
  }
  if (params.trending) markets.sort((a, b) => Number(b.trending_score || 0) - Number(a.trending_score || 0))
  return markets.map(m => {
    const yp = yesPrice(m)
    return {
      ...m,
      title: m.question,
      resolution_date: m.deadline,
      resolved_outcome: m.resolution,
      yes_price: yp,
      no_price: 1 - yp,
      yes_probability: yp,
      no_probability: 1 - yp,
    }
  })
}

async function placeTrade(db: SupabaseClient, userId: string, payload: Record<string, unknown>) {
  const marketId = String(payload.marketId || '')
  const side = String(payload.outcome || payload.side || '').toUpperCase()
  const cost = Number(payload.amount)

  if (!marketId || !['YES', 'NO'].includes(side)) throw new Error('Invalid trade request')
  if (!cost || cost <= 0) throw new Error('Invalid trade amount')

  const bal = await getBalance(db, userId)
  if (cost > bal) throw new Error('Insufficient portfolio balance — deposit funds first')

  const { data: market, error: mErr } = await db.from('markets').select('*').eq('id', marketId).single()
  if (mErr || !market) throw new Error('Market not found')
  if (market.status !== 'open') throw new Error('Market is not open for trading')
  if (market.seed_status && !['completed', 'skipped'].includes(String(market.seed_status))) {
    throw new Error('Market liquidity is still being seeded on-chain — try again shortly')
  }
  if (new Date(market.deadline) < new Date()) throw new Error('Market has closed')

  const totalBefore = Number(market.yes_pool) + Number(market.no_pool)
  const pool = side === 'YES' ? Number(market.yes_pool) : Number(market.no_pool)
  const price = totalBefore > 0 ? pool / totalBefore : 0.5

  await setBalance(db, userId, bal - cost)

  await db.from('markets').update({
    yes_pool: side === 'YES' ? pool + cost : market.yes_pool,
    no_pool: side === 'NO' ? pool + cost : market.no_pool,
    volume: Number(market.volume) + cost,
    trending_score: Number(market.trending_score) + cost * 0.1,
  }).eq('id', marketId)

  const { data: existing } = await db.from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('market_id', marketId)
    .eq('side', side)
    .eq('status', 'open')
    .maybeSingle()

  if (existing) {
    const newQty = Number(existing.quantity) + cost
    await db.from('positions').update({
      quantity: newQty,
      shares: newQty,
      stake_amount: Number(existing.stake_amount ?? existing.cost_basis) + cost,
      avg_entry: ((Number(existing.avg_entry) * Number(existing.quantity)) + (price * cost)) / newQty,
      cost_basis: Number(existing.cost_basis) + cost,
    }).eq('id', existing.id)
  } else {
    const { error: posErr } = await db.from('positions').insert({
      user_id: userId,
      market_id: marketId,
      side,
      quantity: cost,
      shares: cost,
      stake_amount: cost,
      avg_entry: price,
      cost_basis: cost,
    })
    if (posErr) throw new Error(`Failed to open position: ${posErr.message}`)
  }

  const tradeMemo = buildStakeMemo({ userId, marketId, side })
  const { data: tradeRow, error: tradeErr } = await db.from('trades').insert({
    user_id: userId,
    market_id: marketId,
    side,
    quantity: cost,
    price,
    total_cost: cost,
    payment_memo: tradeMemo,
  }).select('id').single()
  if (tradeErr) throw new Error(`Failed to record trade: ${tradeErr.message}`)
  if (tradeRow?.id) {
    const memoWithTrade = buildStakeMemo({ userId, marketId, side, tradeId: tradeRow.id })
    await db.from('trades').update({ payment_memo: memoWithTrade }).eq('id', tradeRow.id)
  }

  await notify(db, userId, 'trade', 'Trade executed', `Bought ${side} for ${cost.toFixed(2)} UCT from your portfolio.`, { marketId, side, amount: cost }).catch(() => {})
  return getPortfolio(db, userId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)
  const rawBody = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const body = (rawBody && typeof rawBody === 'object') ? rawBody as Record<string, unknown> : {}
  const route = String(body.route || url.searchParams.get('route') || '/health')
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload as Record<string, unknown> : body

  const walletAddress = req.headers.get('x-wallet-address') || String(payload.walletAddress || '')
  const nametag = req.headers.get('x-wallet-nametag') || (payload.nametag as string | undefined)
  const directAddress = req.headers.get('x-wallet-direct') || (payload.directAddress as string | undefined)
  const publicKey = req.headers.get('x-wallet-pubkey') || (payload.publicKey as string | undefined)

  try {
    if (route === '/health') return json({ ok: true, service: 'sphere-predict-supabase', flow: 'portfolio-margin' })

    if (route === '/treasury') {
      const { data } = await db.from('treasury_config').select('treasury_address').eq('id', 1).single()
      return json({ address: data?.treasury_address || Deno.env.get('TREASURY_ADDRESS') || '@sphere-predict' })
    }

    if (route === '/markets') {
      const markets = await listMarkets(db, {
        search: (payload.search as string) || url.searchParams.get('search') || undefined,
        category: (payload.category as string) || url.searchParams.get('category') || undefined,
        status: (payload.status as string) || url.searchParams.get('status') || undefined,
        trending: payload.trending === true || url.searchParams.get('trending') === '1',
        includePendingSeed: payload.includePendingSeed === true || url.searchParams.get('includePendingSeed') === '1',
      })
      return json({ markets })
    }

    if (route.startsWith('/markets/') && req.method === 'GET') {
      const id = route.split('/')[2]
      const { data, error } = await db.from('markets').select('*').eq('id', id).single()
      if (error) throw error
      const yp = yesPrice(data)
      return json({
        market: {
          ...data,
          title: data.question,
          resolution_date: data.deadline,
          resolved_outcome: data.resolution,
          yes_price: yp,
          no_price: 1 - yp,
          yes_probability: yp,
          no_probability: 1 - yp,
        },
      })
    }

    if (!walletAddress) return json({ error: 'Wallet authentication required' }, 401)
    const user = await findOrCreateUser(db, { walletAddress, nametag, directAddress, publicKey })

    if (route === '/auth') return json({ user, portfolio: await getPortfolio(db, user.id) })
    if (route === '/portfolio') return json(await getPortfolio(db, user.id))

    if (route === '/settings') {
      const hasPrefsPatch = payload.preferences != null && typeof payload.preferences === 'object'
      if (!hasPrefsPatch) {
        const prefs = normalizePreferences(user.preferences)
        return json({
          preferences: prefs,
          account: {
            nametag: user.nametag,
            wallet_address: user.wallet_address,
            public_key: user.public_key,
            is_admin: user.is_admin,
          },
        })
      }
      const current = normalizePreferences(user.preferences)
      const patch = payload.preferences as Record<string, unknown>
      const merged = normalizePreferences({ ...current, ...patch })
      const { data: updated, error } = await db.from('users')
        .update({ preferences: merged })
        .eq('id', user.id)
        .select('preferences')
        .single()
      if (error) throw error
      return json({ preferences: normalizePreferences(updated?.preferences) })
    }

    if (route === '/notifications') {
      const { data, error } = await db.from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      const unread = (data || []).filter(n => !n.read).length
      return json({ notifications: data || [], unread })
    }

    if (route === '/notifications/read' && req.method === 'POST') {
      const ids = Array.isArray(payload.ids) ? payload.ids as string[] : []
      if (payload.all === true) {
        await db.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
      } else if (ids.length) {
        await db.from('notifications').update({ read: true }).eq('user_id', user.id).in('id', ids)
      }
      return json({ ok: true })
    }

    if (route === '/history') {
      const [{ data: deposits }, { data: withdrawals }, { data: trades }, { data: settlements }, { data: markets }] = await Promise.all([
        db.from('deposits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        db.from('withdrawals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        db.from('trades').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        db.from('positions').select('*').eq('user_id', user.id).eq('status', 'settled').gt('payout', 0).order('settled_at', { ascending: false }).limit(50),
        db.from('markets').select('id, question'),
      ])
      const marketMap = new Map((markets || []).map(m => [m.id, m.question]))
      const history = [
        ...(deposits || []).map(d => ({
          id: `deposit-${d.id}`,
          type: 'deposit',
          amount: Number(d.amount),
          direction: 'in',
          label: 'Deposit',
          detail: d.payment_memo || d.tx_reference || null,
          created_at: d.created_at,
        })),
        ...(withdrawals || []).map(w => ({
          id: `withdrawal-${w.id}`,
          type: 'withdrawal',
          amount: Number(w.amount),
          direction: 'out',
          status: w.status,
          tx_reference: w.tx_reference || null,
          label: w.status === 'completed' ? 'Withdrawal sent' : w.status === 'processing' ? 'Withdrawal processing' : w.status === 'failed' ? 'Withdrawal failed' : 'Withdrawal queued',
          detail: w.payment_memo || (w.status === 'submitted' ? 'Queued for treasury agent' : w.status === 'processing' ? 'Treasury agent sending on-chain' : w.status === 'failed' ? (w.failure_reason || 'Failed — balance restored') : w.tx_reference || 'Completed'),
          created_at: w.created_at,
        })),
        ...(trades || []).map(t => ({
          id: `trade-${t.id}`,
          type: 'trade',
          amount: Number(t.total_cost),
          direction: 'out',
          label: `Trade ${t.side}`,
          detail: t.payment_memo || marketMap.get(t.market_id) || t.market_id,
          market_id: t.market_id,
          created_at: t.created_at,
        })),
        ...(settlements || []).map(s => ({
          id: `settlement-${s.id}`,
          type: 'settlement',
          amount: Number(s.payout),
          direction: 'in',
          label: 'Market payout',
          detail: buildSettleMemo({ userId: s.user_id, marketId: s.market_id, positionId: s.id }),
          market_id: s.market_id,
          created_at: s.settled_at || s.created_at,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return json({ history })
    }

    if (route === '/deposits' && req.method === 'POST') {
      const amount = Number(payload.amount)
      if (!amount || amount <= 0) throw new Error('Invalid deposit amount')
      const paymentMemo = payload.paymentMemo
        ? String(payload.paymentMemo)
        : buildDepositMemo(user.id)
      assertDepositMemo(paymentMemo, user.id)
      const { error: depErr } = await db.from('deposits').insert({
        user_id: user.id,
        amount,
        tx_reference: payload.txReference || null,
        payment_memo: paymentMemo,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })
      if (depErr) throw new Error(`Failed to record deposit: ${depErr.message}`)
      const bal = await getBalance(db, user.id)
      await setBalance(db, user.id, bal + amount)
      await notify(db, user.id, 'deposit', 'Deposit confirmed', `${amount.toFixed(2)} UCT added to your portfolio.`, { amount }).catch(() => {})
      return json({ portfolio: await getPortfolio(db, user.id) })
    }

    if (route === '/withdrawals' && req.method === 'POST') {
      const rawAmount = Number(payload.amount)
      const amount = Math.round(rawAmount * 100) / 100
      const bal = await getBalance(db, user.id)
      if (!amount || amount <= 0 || amount > bal) throw new Error('Insufficient portfolio balance')
      // Reserve funds in portfolio ledger; treasury (@sphere-predict) sends UCT on-chain when admin fulfills.
      await setBalance(db, user.id, bal - amount)
      const { data: withdrawal, error: wErr } = await db.from('withdrawals').insert({
        user_id: user.id,
        amount,
        status: 'submitted',
      }).select().single()
      if (wErr) throw wErr
      const withdrawMemo = buildWithdrawMemo(withdrawal.id)
      await db.from('withdrawals').update({ payment_memo: withdrawMemo }).eq('id', withdrawal.id)
      await notify(
        db,
        user.id,
        'withdrawal',
        'Withdrawal queued',
        `${amount.toFixed(2)} UCT queued — treasury will send to your Sphere wallet (may arrive as one or more transfers; total will match).`,
        { amount, withdrawalId: withdrawal?.id },
      ).catch(() => {})
      return json({ portfolio: await getPortfolio(db, user.id), withdrawal })
    }

    if ((route === '/trades' || route === '/stakes') && req.method === 'POST') {
      const portfolio = await placeTrade(db, user.id, payload)
      return json({ portfolio })
    }

    const admin = user.is_admin || isAdminWallet(walletAddress) || isAdminWallet(nametag)
    if (!admin) return json({ error: 'Admin access required' }, 403)

    if (route === '/admin/treasury-seed') {
      const treasury = await ensureTreasuryUser(db)
      const { seedTotal } = marketSeedAmounts()
      const onChain = await getTreasuryOnChainStatus(db)
      const [pendingWithdrawals, pendingSeeds] = await Promise.all([
        sumPendingWithdrawals(db),
        sumPendingSeeds(db),
      ])
      const onChainBalance = Number(onChain?.on_chain_balance || 0)
      const spendable = onChain
        ? Number(onChain.spendable_after_reserves || 0)
        : Math.max(0, onChainBalance - pendingWithdrawals - pendingSeeds)
      const status = treasuryStatusMeta(onChain?.updated_at)
      return json({
        treasuryUserId: treasury.id,
        seedPerMarket: seedTotal,
        onChainBalance,
        uctTokenCount: Number(onChain?.uct_token_count || 0),
        largestCoin: Number(onChain?.largest_coin_human || 0),
        pendingWithdrawals,
        pendingSeeds,
        spendableAfterReserves: spendable,
        canCreateMarket: seedTotal <= 0 || (status.statusUsable && spendable >= seedTotal),
        statusUpdatedAt: onChain?.updated_at || null,
        statusFresh: status.statusFresh,
        statusUsable: status.statusUsable,
        statusAgeMinutes: status.statusAgeMinutes,
        workerHealth: status.workerHealth,
        source: onChain ? 'treasury_status' : 'unknown',
      })
    }

    if (route === '/admin/markets' && req.method === 'POST') {
      const question = String(payload.question || '').trim()
      if (!question) throw new Error('Market question is required')

      const { seedTotal, seedPerSide } = marketSeedAmounts()
      const treasury = await ensureTreasuryUser(db)
      const treasuryUserId = treasury.id

      if (seedTotal > 0) {
        const onChain = await getTreasuryOnChainStatus(db)
        const [pendingWithdrawals, pendingSeeds] = await Promise.all([
          sumPendingWithdrawals(db),
          sumPendingSeeds(db),
        ])
        const onChainBalance = Number(onChain?.on_chain_balance || 0)
        const spendable = onChain
          ? Number(onChain.spendable_after_reserves || 0)
          : Math.max(0, onChainBalance - pendingWithdrawals - pendingSeeds)
        const status = treasuryStatusMeta(onChain?.updated_at)

        if (!onChain || !status.statusUsable) {
          throw new Error(
            'Treasury on-chain balance is unknown or too stale (>3h). Run the treasury worker (GitHub Actions) '
            + 'and ensure @sphere-predict has spendable UCT before creating markets.',
          )
        }
        if (spendable < seedTotal) {
          throw new Error(
            `Treasury needs at least ${seedTotal} UCT free on-chain for market seed (50/50 YES/NO). `
            + `Spendable after pending withdrawals/seeds: ${spendable.toFixed(2)} UCT `
            + `(wallet ${onChainBalance.toFixed(2)}, reserved wd=${pendingWithdrawals.toFixed(2)} seed=${pendingSeeds.toFixed(2)}). `
            + `Top up @sphere-predict or wait for the treasury agent.`,
          )
        }
      }

      const { data, error } = await db.from('markets').insert({
        question,
        description: payload.description || null,
        resolution_criteria: payload.resolutionCriteria || payload.resolution_criteria || null,
        category: payload.category || 'GENERAL',
        status: seedTotal > 0 ? 'pending_seed' : 'open',
        deadline: new Date(Date.now() + Number(payload.daysOpen || 7) * 864e5).toISOString(),
        created_by: user.id,
        trending_score: seedTotal > 0 ? 0 : 10,
        yes_pool: seedTotal > 0 ? 0 : seedPerSide,
        no_pool: seedTotal > 0 ? 0 : seedPerSide,
        volume: 0,
        seed_liquidity: seedTotal,
        seed_status: seedTotal > 0 ? 'pending' : 'skipped',
      }).select().single()
      if (error) throw error

      if (seedTotal > 0) {
        const finalMemo = buildSeedMemo({ userId: treasuryUserId, marketId: data.id, amount: seedTotal })
        await db.from('markets').update({ seed_payment_memo: finalMemo }).eq('id', data.id)
        await notify(
          db,
          user.id,
          'market',
          'Market queued for seeding',
          `"${question.slice(0, 60)}" queued — treasury will send ${seedTotal} UCT on-chain before trading opens.`,
          { marketId: data.id, seedTotal, seedPerSide, payment_memo: finalMemo },
        ).catch(() => {})
        return json({
          market: { ...data, seed_payment_memo: finalMemo, seed_status: 'pending', status: 'pending_seed' },
          seed: { total: seedTotal, perSide: seedPerSide, payment_memo: finalMemo, status: 'pending' },
        })
      }

      return json({ market: data })
    }

    const closeMatch = route.match(/^\/admin\/markets\/close\/(.+)$/)
    if (closeMatch) {
      await db.from('markets').update({ status: 'closed' }).eq('id', closeMatch[1])
      const { data } = await db.from('markets').select('*').eq('id', closeMatch[1]).single()
      return json({ market: data })
    }

    const resolveMatch = route.match(/^\/admin\/markets\/resolve\/(.+)$/)
    if (resolveMatch) {
      const marketId = resolveMatch[1]
      const res = String(payload.resolution).toUpperCase()
      const { data: existingRes } = await db.from('market_resolutions').select('id').eq('market_id', marketId).maybeSingle()
      if (existingRes) throw new Error('Market already settled')

      const { data: market } = await db.from('markets').select('*').eq('id', marketId).single()
      if (!market || market.status === 'resolved') throw new Error('Market not found or already resolved')

      await db.from('markets').update({
        status: 'resolved',
        resolution: res,
        resolved_at: new Date().toISOString(),
      }).eq('id', marketId)

      const totalPool = Number(market.yes_pool) + Number(market.no_pool)
      const winningPool = res === 'YES' ? Number(market.yes_pool) : Number(market.no_pool)
      const { data: openPositions } = await db.from('positions').select('*').eq('market_id', marketId).eq('status', 'open')
      const userIds = [...new Set((openPositions || []).map(p => p.user_id))]
      const { data: dmUsers } = userIds.length
        ? await db.from('users').select('id, nametag, wallet_address, preferences').in('id', userIds)
        : { data: [] as { id: string; nametag?: string | null; wallet_address?: string | null; preferences?: unknown }[] }
      const userMap = new Map((dmUsers || []).map(u => [u.id, u]))

      let totalPayout = 0
      for (const pos of openPositions || []) {
        const won = pos.side === res
        let payout = 0
        let pnl = -Number(pos.cost_basis || 0)
        if (won && winningPool > 0) {
          payout = (Number(pos.quantity) / winningPool) * totalPool
          pnl = payout - Number(pos.cost_basis || 0)
          totalPayout += payout
          const bal = await getBalance(db, pos.user_id)
          await setBalance(db, pos.user_id, bal + payout)
        }
        const settleMemo = buildSettleMemo({ userId: pos.user_id, marketId, positionId: pos.id })
        await db.from('positions').update({
          status: 'settled',
          payout,
          pnl,
          settled_at: new Date().toISOString(),
        }).eq('id', pos.id)

        await notify(
          db,
          pos.user_id,
          'market',
          won ? 'You won!' : 'Market resolved',
          won
            ? `${payout.toFixed(2)} UCT credited to your portfolio. Withdraw anytime.`
            : `Market resolved ${res}.`,
          { marketId, payout, pnl, won, payment_memo: settleMemo },
        )

        if (won && payout > 0) {
          const dmUser = userMap.get(pos.user_id)
          if (userWantsDm(dmUser?.preferences, 'dmOnWin')) {
            await queueOutboundDm(db, {
              userId: pos.user_id,
              recipient: dmRecipientFromUser(dmUser),
              content: formatMarketWinDm(payout, market.question),
              kind: 'market_win',
              metadata: { marketId, positionId: pos.id, payout },
            }).catch(() => {})
          }
        }
      }

      await db.from('market_resolutions').insert({
        market_id: marketId,
        resolution: res,
        total_payout: totalPayout,
        positions_settled: (openPositions || []).length,
      })

      return json({ market: { ...market, status: 'resolved', resolution: res }, settlement: { total_payout: totalPayout } })
    }

    if (route === '/admin/market-seeds/queue') {
      const statuses = ['pending', 'processing', 'completed', 'failed'] as const
      const counts: Record<string, number> = {}
      await Promise.all(statuses.map(async status => {
        const { count } = await db.from('markets').select('*', { count: 'exact', head: true }).eq('seed_status', status)
        counts[status] = count ?? 0
      }))
      const { data: recent } = await db.from('markets')
        .select('id, question, seed_liquidity, seed_status, seed_tx_reference, seed_failure_reason, created_at, seed_completed_at')
        .neq('seed_status', 'skipped')
        .order('created_at', { ascending: false })
        .limit(25)
      return json({ counts, recent: recent || [] })
    }

    if (route === '/admin/withdrawals/queue') {
      const statuses = ['submitted', 'processing', 'completed', 'failed'] as const
      const counts: Record<string, number> = {}
      await Promise.all(statuses.map(async status => {
        const { count } = await db.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', status)
        counts[status] = count ?? 0
      }))
      const { data: recent } = await db.from('withdrawals')
        .select('id, amount, status, created_at, completed_at, tx_reference, failure_reason, users(nametag, wallet_address)')
        .order('created_at', { ascending: false })
        .limit(25)
      return json({ counts, recent: recent || [] })
    }

    if (route === '/admin/withdrawals/pending') {
      const { data } = await db.from('withdrawals')
        .select('*, users(nametag, wallet_address)')
        .eq('status', 'submitted')
        .order('created_at', { ascending: true })
      return json({ withdrawals: data || [] })
    }

    const fulfillMatch = route.match(/^\/admin\/withdrawals\/fulfill\/(.+)$/)
    if (fulfillMatch) {
      const withdrawalId = fulfillMatch[1]
      const { data: w, error } = await db.from('withdrawals').select('*, users(*)').eq('id', withdrawalId).single()
      if (error || !w) throw new Error('Withdrawal not found')
      if (w.status === 'completed') throw new Error('Already fulfilled')
      const txRef = payload.txReference ? String(payload.txReference) : `treasury_send_${Date.now()}`
      const withdrawMemo = buildWithdrawMemo(withdrawalId)
      await db.from('withdrawals').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        tx_reference: txRef,
        payment_memo: withdrawMemo,
      }).eq('id', withdrawalId)
      const recipient = w.users?.nametag || w.users?.wallet_address || 'user'
      await notify(
        db,
        w.user_id,
        'withdrawal',
        'Withdrawal sent',
        `${Number(w.amount).toFixed(2)} UCT sent from @sphere-predict to ${recipient}.`,
        { withdrawalId, amount: w.amount, txReference: txRef },
      ).catch(() => {})
      if (userWantsDm(w.users?.preferences, 'dmOnWithdrawal')) {
        await queueOutboundDm(db, {
          userId: w.user_id,
          recipient: dmRecipientFromUser(w.users),
          content: formatWithdrawalSentDm(Number(w.amount), txRef),
          kind: 'withdrawal_sent',
          metadata: { withdrawalId, amount: w.amount, txReference: txRef },
        }).catch(() => {})
      }
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error' }, 400)
  }
})