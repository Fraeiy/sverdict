import {
  getUsers, getBalances, getMarkets, getPositions, getTrades,
  getDeposits, getWithdrawals, getNotifications, getResolutions,
  persist, newId, seedMarketsIfEmpty,
} from './store.mjs'

const ADMIN_WALLETS = new Set([
  'sphere-predict',
  'DIRECT://00003db7de43899584dd9a5306096750f32e4c06b201c8e99adf4b8e34e4f2d94dde41318434',
])

function normalizeWallet(addr) {
  if (!addr) return ''
  const s = String(addr).trim()
  if (s.startsWith('@')) return s.slice(1).toLowerCase()
  return s.toUpperCase()
}

export function isAdminWallet(wallet) {
  if (!wallet) return false
  const raw = String(wallet).trim()
  const lower = raw.toLowerCase().replace(/^@/, '')
  const upper = raw.toUpperCase()
  return ADMIN_WALLETS.has(lower) || ADMIN_WALLETS.has(upper) || lower === 'sphere-predict'
}

export async function findOrCreateUser({ walletAddress, nametag, publicKey }) {
  const users = await getUsers()
  const key = normalizeWallet(walletAddress)
  let user = users.find(u => normalizeWallet(u.wallet_address) === key)
  if (!user) {
    user = {
      id: newId(),
      wallet_address: walletAddress,
      nametag: nametag || null,
      public_key: publicKey || null,
      is_admin: isAdminWallet(walletAddress) || isAdminWallet(nametag),
      created_at: new Date().toISOString(),
    }
    users.push(user)
    const balances = await getBalances()
    balances[user.id] = { available_balance: 0, updated_at: new Date().toISOString() }
    await persist('users')
    await persist('balances')
  }
  return user
}

export async function getUserBalance(userId) {
  const balances = await getBalances()
  return Number(balances[userId]?.available_balance || 0)
}

async function setBalance(userId, amount) {
  const balances = await getBalances()
  balances[userId] = { available_balance: amount, updated_at: new Date().toISOString() }
  await persist('balances')
}

async function addNotification(userId, type, title, body, metadata = {}) {
  const notifications = await getNotifications()
  notifications.unshift({
    id: newId(),
    user_id: userId,
    type,
    title,
    body,
    read: false,
    metadata,
    created_at: new Date().toISOString(),
  })
  await persist('notifications')
  return notifications[0]
}

export function yesPrice(market) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  if (!total) return 0.5
  return Number(market.yes_pool || 0) / total
}

export function currentPositionValue(position, market) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  if (!total || position.status !== 'open') return 0
  const pool = position.side === 'YES' ? Number(market.yes_pool || 0) : Number(market.no_pool || 0)
  if (!pool) return position.cost_basis
  return (position.quantity / pool) * total
}

export async function getPortfolio(userId) {
  const positions = (await getPositions()).filter(p => p.user_id === userId)
  const markets = await getMarkets()
  const marketMap = new Map(markets.map(m => [m.id, m]))

  const open = positions.filter(p => p.status === 'open')
  const settled = positions.filter(p => p.status === 'settled')

  let unrealizedPnl = 0
  const openWithValue = open.map(p => {
    const market = marketMap.get(p.market_id)
    const currentValue = market ? currentPositionValue(p, market) : p.cost_basis
    const pnl = currentValue - p.cost_basis
    unrealizedPnl += pnl
    return { ...p, market, current_value: currentValue, unrealized_pnl: pnl }
  })

  const realizedPnl = settled.reduce((s, p) => s + Number(p.pnl || 0), 0)
  const available = await getUserBalance(userId)
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

export async function confirmDeposit({ userId, amount, txReference }) {
  const deposits = await getDeposits()
  const deposit = {
    id: newId(),
    user_id: userId,
    amount: Number(amount),
    tx_reference: txReference || null,
    status: 'confirmed',
    created_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
  }
  deposits.unshift(deposit)
  const bal = await getUserBalance(userId)
  await setBalance(userId, bal + Number(amount))
  await persist('deposits')
  await addNotification(userId, 'deposit', 'Deposit confirmed', `$${Number(amount).toFixed(2)} added to your portfolio balance.`, { depositId: deposit.id, amount })
  return deposit
}

export async function requestWithdrawal({ userId, amount }) {
  const bal = await getUserBalance(userId)
  const amt = Number(amount)
  if (amt <= 0 || amt > bal) throw new Error('Insufficient balance')
  await setBalance(userId, bal - amt)
  const withdrawals = await getWithdrawals()
  const withdrawal = {
    id: newId(),
    user_id: userId,
    amount: amt,
    status: 'submitted',
    tx_reference: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  }
  withdrawals.unshift(withdrawal)
  await persist('withdrawals')
  await addNotification(userId, 'withdrawal', 'Withdrawal submitted', `$${amt.toFixed(2)} withdrawal is being processed.`, { withdrawalId: withdrawal.id, amount: amt })
  // Auto-complete for demo (treasury would send on-chain in production)
  withdrawal.status = 'completed'
  withdrawal.completed_at = new Date().toISOString()
  await persist('withdrawals')
  await addNotification(userId, 'withdrawal', 'Withdrawal completed', `$${amt.toFixed(2)} sent to your Sphere wallet.`, { withdrawalId: withdrawal.id, amount: amt })
  return withdrawal
}

export async function placeTrade({ userId, marketId, side, amount, signature, signedMessage }) {
  const markets = await getMarkets()
  const market = markets.find(m => m.id === marketId)
  if (!market) throw new Error('Market not found')
  if (market.status !== 'open') throw new Error('Market is not open for trading')
  if (new Date(market.deadline) < new Date()) throw new Error('Market has closed')

  const cost = Number(amount)
  if (cost <= 0) throw new Error('Invalid trade amount')
  const bal = await getUserBalance(userId)
  if (cost > bal) throw new Error('Insufficient portfolio balance')

  const totalBefore = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  const pool = side === 'YES' ? Number(market.yes_pool || 0) : Number(market.no_pool || 0)
  const price = totalBefore > 0 ? (pool / totalBefore) : 0.5

  await setBalance(userId, bal - cost)

  if (side === 'YES') market.yes_pool = pool + cost
  else market.no_pool = pool + cost
  market.volume = Number(market.volume || 0) + cost
  market.trending_score = Number(market.trending_score || 0) + cost * 0.1
  await persist('markets')

  const positions = await getPositions()
  let position = positions.find(p => p.user_id === userId && p.market_id === marketId && p.side === side && p.status === 'open')
  if (position) {
    const newQty = position.quantity + cost
    position.avg_entry = ((position.avg_entry * position.quantity) + (price * cost)) / newQty
    position.quantity = newQty
    position.cost_basis += cost
  } else {
    position = {
      id: newId(),
      user_id: userId,
      market_id: marketId,
      side,
      quantity: cost,
      avg_entry: price,
      cost_basis: cost,
      status: 'open',
      payout: null,
      pnl: null,
      created_at: new Date().toISOString(),
      settled_at: null,
    }
    positions.push(position)
  }
  await persist('positions')

  const trades = await getTrades()
  const trade = {
    id: newId(),
    user_id: userId,
    market_id: marketId,
    side,
    quantity: cost,
    price,
    total_cost: cost,
    signature: signature || null,
    signed_message: signedMessage || null,
    created_at: new Date().toISOString(),
  }
  trades.unshift(trade)
  await persist('trades')

  await addNotification(userId, 'trade', 'Trade executed', `Bought ${side} on "${market.question.slice(0, 60)}…" for $${cost.toFixed(2)}.`, { tradeId: trade.id, marketId, side, amount: cost })
  return { trade, position, market }
}

export async function createMarket({ userId, question, category, daysOpen, description }) {
  const markets = await getMarkets()
  const market = {
    id: newId(),
    question,
    description: description || null,
    category: category || 'GENERAL',
    status: 'open',
    deadline: new Date(Date.now() + Number(daysOpen || 7) * 864e5).toISOString(),
    yes_pool: 0,
    no_pool: 0,
    volume: 0,
    trending_score: 10,
    resolution: null,
    resolved_at: null,
    created_by: userId,
    created_at: new Date().toISOString(),
  }
  markets.unshift(market)
  await persist('markets')
  return market
}

export async function closeMarket(marketId) {
  const markets = await getMarkets()
  const market = markets.find(m => m.id === marketId)
  if (!market) throw new Error('Market not found')
  market.status = 'closed'
  await persist('markets')
  const positions = await getPositions()
  const userIds = [...new Set(positions.filter(p => p.market_id === marketId && p.status === 'open').map(p => p.user_id))]
  for (const uid of userIds) {
    await addNotification(uid, 'market', 'Market closing soon', `"${market.question.slice(0, 60)}…" is now closed pending resolution.`, { marketId })
  }
  return market
}

/** Idempotent settlement — market can never settle twice */
export async function resolveMarket({ marketId, resolution }) {
  const resolutions = await getResolutions()
  if (resolutions.some(r => r.market_id === marketId)) {
    throw new Error('Market already settled')
  }
  const markets = await getMarkets()
  const market = markets.find(m => m.id === marketId)
  if (!market) throw new Error('Market not found')
  if (market.status === 'resolved') throw new Error('Market already resolved')

  const res = String(resolution).toUpperCase()
  if (res !== 'YES' && res !== 'NO') throw new Error('Resolution must be YES or NO')

  market.status = 'resolved'
  market.resolution = res
  market.resolved_at = new Date().toISOString()
  await persist('markets')

  const totalPool = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  const winningPool = res === 'YES' ? Number(market.yes_pool || 0) : Number(market.no_pool || 0)

  const positions = await getPositions()
  const openPositions = positions.filter(p => p.market_id === marketId && p.status === 'open')
  let totalPayout = 0

  for (const pos of openPositions) {
    const won = pos.side === res
    let payout = 0
    let pnl = -pos.cost_basis
    if (won && winningPool > 0) {
      payout = (pos.quantity / winningPool) * totalPool
      pnl = payout - pos.cost_basis
      const bal = await getUserBalance(pos.user_id)
      await setBalance(pos.user_id, bal + payout)
      totalPayout += payout
    }
    pos.status = 'settled'
    pos.payout = payout
    pos.pnl = pnl
    pos.settled_at = new Date().toISOString()
    await addNotification(pos.user_id, 'market', 'Position settled', won
      ? `You won $${payout.toFixed(2)} on "${market.question.slice(0, 50)}…".`
      : `Market resolved ${res}. Your ${pos.side} position did not win.`,
      { marketId, resolution: res, payout, pnl })
  }
  await persist('positions')

  const record = {
    id: newId(),
    market_id: marketId,
    resolution: res,
    total_payout: totalPayout,
    positions_settled: openPositions.length,
    settled_at: new Date().toISOString(),
    metadata: { total_pool: totalPool },
  }
  resolutions.push(record)
  await persist('resolutions')

  return { market, settlement: record }
}

export async function listMarkets({ search, category, status, trending }) {
  await seedMarketsIfEmpty()
  let markets = await getMarkets()
  if (search) {
    const q = search.toLowerCase()
    markets = markets.filter(m => m.question.toLowerCase().includes(q) || (m.category || '').toLowerCase().includes(q))
  }
  if (category && category !== 'all') {
    markets = markets.filter(m => (m.category || '').toUpperCase() === category.toUpperCase())
  }
  if (status && status !== 'all') {
    markets = markets.filter(m => m.status === status)
  }
  if (trending) {
    markets = [...markets].sort((a, b) => Number(b.trending_score || 0) - Number(a.trending_score || 0))
  }
  return markets.map(m => ({ ...m, yes_price: yesPrice(m), no_price: 1 - yesPrice(m) }))
}

export async function initPlatform() {
  await seedMarketsIfEmpty()
}