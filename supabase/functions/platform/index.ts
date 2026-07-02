import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function listMarkets(db: SupabaseClient, params: { search?: string; category?: string; status?: string; trending?: boolean }) {
  let q = db.from('markets').select('*')
  if (params.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params.category && params.category !== 'all') q = q.eq('category', params.category)
  const { data, error } = await q
  if (error) throw error
  let markets = data || []
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

  const { error: tradeErr } = await db.from('trades').insert({
    user_id: userId,
    market_id: marketId,
    side,
    quantity: cost,
    price,
    total_cost: cost,
  })
  if (tradeErr) throw new Error(`Failed to record trade: ${tradeErr.message}`)

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
          detail: d.tx_reference || null,
          created_at: d.created_at,
        })),
        ...(withdrawals || []).map(w => ({
          id: `withdrawal-${w.id}`,
          type: 'withdrawal',
          amount: Number(w.amount),
          direction: 'out',
          label: w.status === 'completed' ? 'Withdrawal sent' : w.status === 'processing' ? 'Withdrawal processing' : w.status === 'failed' ? 'Withdrawal failed' : 'Withdrawal queued',
          detail: w.status === 'submitted' ? 'Queued for treasury agent' : w.status === 'processing' ? 'Treasury agent sending on-chain' : w.status === 'failed' ? (w.failure_reason || 'Failed — balance restored') : 'Completed',
          created_at: w.created_at,
        })),
        ...(trades || []).map(t => ({
          id: `trade-${t.id}`,
          type: 'trade',
          amount: Number(t.total_cost),
          direction: 'out',
          label: `Trade ${t.side}`,
          detail: marketMap.get(t.market_id) || t.market_id,
          market_id: t.market_id,
          created_at: t.created_at,
        })),
        ...(settlements || []).map(s => ({
          id: `settlement-${s.id}`,
          type: 'settlement',
          amount: Number(s.payout),
          direction: 'in',
          label: 'Market payout',
          detail: marketMap.get(s.market_id) || s.market_id,
          market_id: s.market_id,
          created_at: s.settled_at || s.created_at,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return json({ history })
    }

    if (route === '/deposits' && req.method === 'POST') {
      const amount = Number(payload.amount)
      if (!amount || amount <= 0) throw new Error('Invalid deposit amount')
      const { error: depErr } = await db.from('deposits').insert({
        user_id: user.id,
        amount,
        tx_reference: payload.txReference || null,
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
      const amount = Number(payload.amount)
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
      await notify(
        db,
        user.id,
        'withdrawal',
        'Withdrawal queued',
        `${amount.toFixed(2)} UCT queued — treasury will send to your Sphere wallet.`,
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

    if (route === '/admin/markets' && req.method === 'POST') {
      const { data, error } = await db.from('markets').insert({
        question: payload.question,
        description: payload.description || null,
        resolution_criteria: payload.resolutionCriteria || payload.resolution_criteria || null,
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

      await db.from('markets').update({
        status: 'resolved',
        resolution: res,
        resolved_at: new Date().toISOString(),
      }).eq('id', marketId)

      const totalPool = Number(market.yes_pool) + Number(market.no_pool)
      const winningPool = res === 'YES' ? Number(market.yes_pool) : Number(market.no_pool)
      const { data: openPositions } = await db.from('positions').select('*').eq('market_id', marketId).eq('status', 'open')

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
          { marketId, payout, pnl, won },
        )
      }

      await db.from('market_resolutions').insert({
        market_id: marketId,
        resolution: res,
        total_payout: totalPayout,
        positions_settled: (openPositions || []).length,
      })

      return json({ market: { ...market, status: 'resolved', resolution: res }, settlement: { total_payout: totalPayout } })
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
      await db.from('withdrawals').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        tx_reference: payload.txReference ? String(payload.txReference) : `treasury_send_${Date.now()}`,
      }).eq('id', withdrawalId)
      const recipient = w.users?.nametag || w.users?.wallet_address || 'user'
      await notify(
        db,
        w.user_id,
        'withdrawal',
        'Withdrawal sent',
        `${Number(w.amount).toFixed(2)} UCT sent from @sphere-predict to ${recipient}.`,
        { withdrawalId, amount: w.amount },
      ).catch(() => {})
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error' }, 400)
  }
})