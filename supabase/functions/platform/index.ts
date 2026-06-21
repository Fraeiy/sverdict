import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-wallet-nametag, x-wallet-pubkey',
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

function currentPositionValue(position: { side: string; quantity: number; cost_basis: number; status: string }, market: { yes_pool: number; no_pool: number }) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  if (!total || position.status !== 'open') return 0
  const pool = position.side === 'YES' ? Number(market.yes_pool || 0) : Number(market.no_pool || 0)
  if (!pool) return position.cost_basis
  return (position.quantity / pool) * total
}

async function findOrCreateUser(db: SupabaseClient, auth: { walletAddress: string; nametag?: string; publicKey?: string }) {
  const key = normalizeWallet(auth.walletAddress)
  const { data: users } = await db.from('users').select('*')
  let user = (users || []).find(u => normalizeWallet(u.wallet_address) === key)
  if (!user) {
    const { data, error } = await db.from('users').insert({
      wallet_address: auth.walletAddress,
      nametag: auth.nametag || null,
      public_key: auth.publicKey || null,
      is_admin: isAdminWallet(auth.walletAddress) || isAdminWallet(auth.nametag),
    }).select().single()
    if (error) throw error
    user = data
    await db.from('balances').insert({ user_id: user.id, available_balance: 0 })
  }
  return user
}

async function getBalance(db: SupabaseClient, userId: string) {
  const { data } = await db.from('balances').select('available_balance').eq('user_id', userId).single()
  return Number(data?.available_balance || 0)
}

async function setBalance(db: SupabaseClient, userId: string, amount: number) {
  const { error } = await db.from('balances').upsert({ user_id: userId, available_balance: amount, updated_at: new Date().toISOString() })
  if (error) throw error
}

async function notify(db: SupabaseClient, userId: string, type: string, title: string, body: string, metadata: Record<string, unknown> = {}) {
  await db.from('notifications').insert({ user_id: userId, type, title, body, metadata })
}

async function getPortfolio(db: SupabaseClient, userId: string) {
  const [{ data: positions }, { data: markets }, available] = await Promise.all([
    db.from('positions').select('*').eq('user_id', userId),
    db.from('markets').select('*'),
    getBalance(db, userId),
  ])
  const marketMap = new Map((markets || []).map(m => [m.id, m]))
  const open = (positions || []).filter(p => p.status === 'open')
  const settled = (positions || []).filter(p => p.status === 'settled')
  let unrealizedPnl = 0
  const openWithValue = open.map(p => {
    const market = marketMap.get(p.market_id)
    const currentValue = market ? currentPositionValue(p, market) : p.cost_basis
    const pnl = currentValue - p.cost_basis
    unrealizedPnl += pnl
    return { ...p, market, current_value: currentValue, unrealized_pnl: pnl }
  })
  const realizedPnl = settled.reduce((s, p) => s + Number(p.pnl || 0), 0)
  const positionsValue = openWithValue.reduce((s, p) => s + p.current_value, 0)
  return {
    available_balance: available,
    total_portfolio_value: available + positionsValue,
    unrealized_pnl: unrealizedPnl,
    realized_pnl: realizedPnl,
    total_pnl: unrealizedPnl + realizedPnl,
    open_positions: openWithValue,
    resolved_positions: settled.map(p => ({ ...p, market: marketMap.get(p.market_id) })),
  }
}

async function listMarkets(db: SupabaseClient, params: { search?: string; category?: string; status?: string; trending?: boolean }) {
  let q = db.from('markets').select('*')
  if (params.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params.category && params.category !== 'all') q = q.eq('category', params.category)
  const { data, error } = await q
  if (error) throw error
  let markets = data || []
  if (params.search) {
    const s = params.search.toLowerCase()
    markets = markets.filter(m => m.question.toLowerCase().includes(s) || (m.category || '').toLowerCase().includes(s))
  }
  if (params.trending) markets.sort((a, b) => Number(b.trending_score || 0) - Number(a.trending_score || 0))
  return markets.map(m => ({ ...m, yes_price: yesPrice(m), no_price: 1 - yesPrice(m) }))
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
  const publicKey = req.headers.get('x-wallet-pubkey') || (payload.publicKey as string | undefined)

  try {
    if (route === '/health') return json({ ok: true, service: 'sphere-predict-supabase' })

    if (route === '/treasury') {
      const { data } = await db.from('treasury_config').select('treasury_address').eq('id', 1).single()
      return json({ address: data?.treasury_address || Deno.env.get('TREASURY_ADDRESS') || '' })
    }

    if (route === '/markets') {
      const markets = await listMarkets(db, {
        search: (payload.search as string) || url.searchParams.get('search') || undefined,
        category: (payload.category as string) || url.searchParams.get('category') || undefined,
        status: (payload.status as string) || url.searchParams.get('status') || undefined,
        trending: payload.trending === true || url.searchParams.get('trending') === '1',
      })
      return json({ markets })
    }

    if (route.startsWith('/markets/') && req.method === 'GET') {
      const id = route.split('/')[2]
      const { data, error } = await db.from('markets').select('*').eq('id', id).single()
      if (error) throw error
      return json({ market: { ...data, yes_price: yesPrice(data), no_price: 1 - yesPrice(data) } })
    }

    if (!walletAddress) return json({ error: 'Wallet authentication required' }, 401)
    const user = await findOrCreateUser(db, { walletAddress, nametag, publicKey })

    if (route === '/auth') return json({ user, portfolio: await getPortfolio(db, user.id) })
    if (route === '/portfolio') return json(await getPortfolio(db, user.id))

    if (route === '/notifications/read-all') {
      await db.from('notifications').update({ read: true }).eq('user_id', user.id)
      return json({ ok: true })
    }

    const notifRead = route.match(/^\/notifications\/([^/]+)\/read$/)
    if (notifRead) {
      await db.from('notifications').update({ read: true }).eq('id', notifRead[1]).eq('user_id', user.id)
      return json({ ok: true })
    }

    if (route === '/notifications') {
      const { data } = await db.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      return json({ notifications: data || [] })
    }

    if (route === '/deposits' && req.method === 'POST') {
      const amount = Number(payload.amount)
      const bal = await getBalance(db, user.id)
      await setBalance(db, user.id, bal + amount)
      await db.from('deposits').insert({ user_id: user.id, amount, tx_reference: payload.txReference, status: 'confirmed', confirmed_at: new Date().toISOString() })
      await notify(db, user.id, 'deposit', 'Deposit confirmed', `$${amount.toFixed(2)} added to your portfolio balance.`, { amount })
      return json({ portfolio: await getPortfolio(db, user.id) })
    }

    if (route === '/withdrawals' && req.method === 'POST') {
      const amount = Number(payload.amount)
      const bal = await getBalance(db, user.id)
      if (amount <= 0 || amount > bal) throw new Error('Insufficient balance')
      await setBalance(db, user.id, bal - amount)
      await db.from('withdrawals').insert({ user_id: user.id, amount, status: 'completed', completed_at: new Date().toISOString() })
      await notify(db, user.id, 'withdrawal', 'Withdrawal completed', `$${amount.toFixed(2)} sent to your Sphere wallet.`, { amount })
      return json({ portfolio: await getPortfolio(db, user.id) })
    }

    if (route === '/trades' && req.method === 'POST') {
      const { marketId, side, amount, signature, signedMessage } = payload
      const cost = Number(amount)
      const { data: market, error: mErr } = await db.from('markets').select('*').eq('id', marketId).single()
      if (mErr || !market) throw new Error('Market not found')
      if (market.status !== 'open') throw new Error('Market is not open for trading')
      if (new Date(market.deadline) < new Date()) throw new Error('Market has closed')
      const bal = await getBalance(db, user.id)
      if (cost <= 0 || cost > bal) throw new Error('Insufficient portfolio balance')
      const totalBefore = Number(market.yes_pool) + Number(market.no_pool)
      const pool = side === 'YES' ? Number(market.yes_pool) : Number(market.no_pool)
      const price = totalBefore > 0 ? pool / totalBefore : 0.5
      await setBalance(db, user.id, bal - cost)
      await db.from('markets').update({
        yes_pool: side === 'YES' ? pool + cost : market.yes_pool,
        no_pool: side === 'NO' ? pool + cost : market.no_pool,
        volume: Number(market.volume) + cost,
        trending_score: Number(market.trending_score) + cost * 0.1,
      }).eq('id', marketId)
      const { data: existing } = await db.from('positions').select('*').eq('user_id', user.id).eq('market_id', marketId).eq('side', side).eq('status', 'open').maybeSingle()
      if (existing) {
        const newQty = existing.quantity + cost
        await db.from('positions').update({
          quantity: newQty,
          avg_entry: ((existing.avg_entry * existing.quantity) + (price * cost)) / newQty,
          cost_basis: existing.cost_basis + cost,
        }).eq('id', existing.id)
      } else {
        await db.from('positions').insert({ user_id: user.id, market_id: marketId, side, quantity: cost, avg_entry: price, cost_basis: cost })
      }
      await db.from('trades').insert({ user_id: user.id, market_id: marketId, side, quantity: cost, price, total_cost: cost, signature, signed_message: signedMessage })
      await notify(db, user.id, 'trade', 'Trade executed', `Bought ${side} for $${cost.toFixed(2)}.`, { marketId, side, amount: cost })
      return json({ portfolio: await getPortfolio(db, user.id) })
    }

    const admin = user.is_admin || isAdminWallet(walletAddress) || isAdminWallet(nametag)
    if (!admin) return json({ error: 'Admin access required' }, 403)

    if (route === '/admin/markets' && req.method === 'POST') {
      const { data, error } = await db.from('markets').insert({
        question: payload.question,
        category: payload.category || 'GENERAL',
        status: 'open',
        deadline: new Date(Date.now() + Number(payload.daysOpen || 7) * 864e5).toISOString(),
        created_by: user.id,
        trending_score: 10,
      }).select().single()
      if (error) throw error
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
      await db.from('markets').update({ status: 'resolved', resolution: res, resolved_at: new Date().toISOString() }).eq('id', marketId)
      const totalPool = Number(market.yes_pool) + Number(market.no_pool)
      const winningPool = res === 'YES' ? Number(market.yes_pool) : Number(market.no_pool)
      const { data: openPositions } = await db.from('positions').select('*').eq('market_id', marketId).eq('status', 'open')
      let totalPayout = 0
      for (const pos of openPositions || []) {
        const won = pos.side === res
        let payout = 0, pnl = -pos.cost_basis
        if (won && winningPool > 0) {
          payout = (pos.quantity / winningPool) * totalPool
          pnl = payout - pos.cost_basis
          const bal = await getBalance(db, pos.user_id)
          await setBalance(db, pos.user_id, bal + payout)
          totalPayout += payout
        }
        await db.from('positions').update({ status: 'settled', payout, pnl, settled_at: new Date().toISOString() }).eq('id', pos.id)
        await notify(db, pos.user_id, 'market', 'Position settled', won ? `You won $${payout.toFixed(2)}.` : `Market resolved ${res}.`, { marketId, payout, pnl })
      }
      await db.from('market_resolutions').insert({ market_id: marketId, resolution: res, total_payout: totalPayout, positions_settled: (openPositions || []).length })
      return json({ market: { ...market, status: 'resolved', resolution: res }, settlement: { total_payout: totalPayout } })
    }

    if (route === '/admin/deposits') {
      const { data } = await db.from('deposits').select('*').order('created_at', { ascending: false })
      return json({ deposits: data })
    }
    if (route === '/admin/withdrawals') {
      const { data } = await db.from('withdrawals').select('*').order('created_at', { ascending: false })
      return json({ withdrawals: data })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error' }, 400)
  }
})