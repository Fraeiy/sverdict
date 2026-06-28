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
    await db.from('balances').insert({ user_id: user.id, available_balance: 0 }).catch(() => {})
  }
  return user
}

async function notify(db: SupabaseClient, userId: string, type: string, title: string, body: string, metadata: Record<string, unknown> = {}) {
  await db.from('notifications').insert({ user_id: userId, type, title, body, metadata })
}

async function getPortfolio(db: SupabaseClient, userId: string) {
  const [{ data: positions }, { data: markets }, { data: claims }] = await Promise.all([
    db.from('positions').select('*').eq('user_id', userId),
    db.from('markets').select('*'),
    db.from('claims').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ])
  const marketMap = new Map((markets || []).map(m => [m.id, m]))
  const open = (positions || []).filter(p => p.status === 'open')
  const settled = (positions || []).filter(p => p.status === 'settled')

  const openWithValue = open.map(p => {
    const market = marketMap.get(p.market_id)
    const currentValue = market ? currentPositionValue(p, market) : Number(p.cost_basis || 0)
    const payout = market ? potentialPayout(p, market) : Number(p.cost_basis || 0)
    return {
      ...p,
      outcome: p.side,
      shares: Number(p.shares ?? p.quantity),
      stake_amount: Number(p.stake_amount ?? p.cost_basis),
      market,
      current_value: currentValue,
      unrealized_pnl: currentValue - Number(p.cost_basis || 0),
      potential_payout: payout,
    }
  })

  const resolvedPositions = settled.map(p => ({
    ...p,
    outcome: p.side,
    shares: Number(p.shares ?? p.quantity),
    stake_amount: Number(p.stake_amount ?? p.cost_basis),
    market: marketMap.get(p.market_id),
  }))

  const pendingClaims = (claims || [])
    .filter(c => c.status === 'pending')
    .map(c => ({ ...c, market: marketMap.get(c.market_id) }))

  const totalStaked = openWithValue.reduce((s, p) => s + Number(p.stake_amount ?? p.cost_basis), 0)
  const totalClaimable = pendingClaims.reduce((s, c) => s + Number(c.amount), 0)
  const estimatedValue = openWithValue.reduce((s, p) => s + Number(p.current_value || 0), 0)

  return {
    open_positions: openWithValue,
    resolved_positions: resolvedPositions,
    pending_claims: pendingClaims,
    total_staked: totalStaked,
    total_claimable: totalClaimable,
    estimated_value: estimatedValue,
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

async function placeStake(db: SupabaseClient, userId: string, payload: Record<string, unknown>) {
  const marketId = String(payload.marketId || '')
  const side = String(payload.outcome || payload.side || '').toUpperCase()
  const cost = Number(payload.amount)
  const txReference = payload.txReference ? String(payload.txReference) : null
  const memo = payload.memo ? String(payload.memo) : `market:${marketId}:outcome:${side}`

  if (!marketId || !['YES', 'NO'].includes(side)) throw new Error('Invalid stake request')
  if (!cost || cost <= 0) throw new Error('Invalid stake amount')

  const { data: market, error: mErr } = await db.from('markets').select('*').eq('id', marketId).single()
  if (mErr || !market) throw new Error('Market not found')
  if (market.status !== 'open') throw new Error('Market is not open for trading')
  if (new Date(market.deadline) < new Date()) throw new Error('Market has closed')

  const totalBefore = Number(market.yes_pool) + Number(market.no_pool)
  const pool = side === 'YES' ? Number(market.yes_pool) : Number(market.no_pool)
  const price = totalBefore > 0 ? pool / totalBefore : 0.5

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
      tx_reference: txReference,
    }).eq('id', existing.id)
  } else {
    await db.from('positions').insert({
      user_id: userId,
      market_id: marketId,
      side,
      quantity: cost,
      shares: cost,
      stake_amount: cost,
      avg_entry: price,
      cost_basis: cost,
      tx_reference: txReference,
    })
  }

  await db.from('trades').insert({
    user_id: userId,
    market_id: marketId,
    side,
    quantity: cost,
    price,
    total_cost: cost,
    signed_message: memo,
  })

  await notify(db, userId, 'stake', 'Position opened', `You staked ${cost.toFixed(2)} UCT on ${side}.`, { marketId, side, amount: cost, memo })
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
  const publicKey = req.headers.get('x-wallet-pubkey') || (payload.publicKey as string | undefined)

  try {
    if (route === '/health') return json({ ok: true, service: 'sphere-predict-supabase', flow: 'sphere-native' })

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
    const user = await findOrCreateUser(db, { walletAddress, nametag, publicKey })

    if (route === '/auth') return json({ user, portfolio: await getPortfolio(db, user.id) })
    if (route === '/portfolio') return json(await getPortfolio(db, user.id))

    if (route === '/claims') {
      const portfolio = await getPortfolio(db, user.id)
      return json({ claims: portfolio.pending_claims })
    }

    const claimMatch = route.match(/^\/claims\/([^/]+)\/claim$/)
    if (claimMatch && req.method === 'POST') {
      const claimId = claimMatch[1]
      const { data: claim, error } = await db.from('claims').select('*').eq('id', claimId).eq('user_id', user.id).single()
      if (error || !claim) throw new Error('Claim not found')
      if (claim.status === 'claimed') throw new Error('Reward already claimed')

      const txRef = payload.txReference ? String(payload.txReference) : `claim_${Date.now()}`
      await db.from('claims').update({
        status: 'claimed',
        claimed_at: new Date().toISOString(),
        tx_reference: txRef,
      }).eq('id', claimId)

      await notify(
        db,
        user.id,
        'claim',
        'Reward claimed',
        `${Number(claim.amount).toFixed(2)} UCT sent to your Sphere wallet.`,
        { claimId, amount: claim.amount },
      )

      return json({ claim: { ...claim, status: 'claimed', claimed_at: new Date().toISOString() }, amount: claim.amount })
    }

    if ((route === '/stakes' || route === '/trades') && req.method === 'POST') {
      const portfolio = await placeStake(db, user.id, payload)
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
          await db.from('claims').insert({
            user_id: pos.user_id,
            market_id: marketId,
            position_id: pos.id,
            amount: payout,
            status: 'pending',
          })
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
          won ? 'Market resolved — claim your reward' : 'Market resolved',
          won
            ? `You won ${payout.toFixed(2)} UCT. Claim it from your portfolio.`
            : `Market resolved ${res}. Your position did not win.`,
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

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error' }, 400)
  }
})