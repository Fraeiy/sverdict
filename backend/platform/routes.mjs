import {
  findOrCreateUser, getPortfolio, confirmDeposit, requestWithdrawal,
  placeTrade, createMarket, closeMarket, resolveMarket, listMarkets, isAdminWallet,
} from './engine.mjs'
import { getNotifications, getDeposits, getWithdrawals, getTreasury, setTreasury } from './store.mjs'

function parseAuth(req, body) {
  const wallet = body?.walletAddress || req.headers['x-wallet-address']
  const nametag = body?.nametag || req.headers['x-wallet-nametag']
  const publicKey = body?.publicKey || req.headers['x-wallet-pubkey']
  if (!wallet) return null
  return { walletAddress: wallet, nametag, publicKey }
}

export async function handlePlatformApi(req, res, urlPath, body) {
  const parts = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const resource = parts[0] || ''
  const id = parts[1]
  const action = parts[2]

  try {
    // Public
    if (resource === 'health') {
      return sendJson(res, 200, { ok: true, service: 'sphere-predict-platform' })
    }

    if (resource === 'treasury') {
      const t = await getTreasury()
      return sendJson(res, 200, t)
    }

    if (resource === 'treasury' && req.method === 'POST' && id === 'address') {
      const { address } = body || {}
      const t = await setTreasury(address)
      return sendJson(res, 200, t)
    }

    if (resource === 'markets' && req.method === 'GET' && !id) {
      const { search, category, status, trending } = Object.fromEntries(new URL(req.url, 'http://x').searchParams)
      const markets = await listMarkets({ search, category, status, trending: trending === '1' })
      return sendJson(res, 200, { markets })
    }

    if (resource === 'markets' && req.method === 'GET' && id) {
      const markets = await listMarkets({})
      const market = markets.find(m => m.id === id)
      if (!market) return sendJson(res, 404, { error: 'Not found' })
      return sendJson(res, 200, { market })
    }

    const auth = parseAuth(req, body)
    if (!auth) return sendJson(res, 401, { error: 'Wallet authentication required' })

    const user = await findOrCreateUser(auth)

    if (resource === 'auth' && req.method === 'POST') {
      return sendJson(res, 200, { user, portfolio: await getPortfolio(user.id) })
    }

    if (resource === 'portfolio') {
      return sendJson(res, 200, await getPortfolio(user.id))
    }

    if (resource === 'notifications') {
      const all = (await getNotifications()).filter(n => n.user_id === user.id)
      if (req.method === 'POST' && id && action === 'read') {
        const n = all.find(x => x.id === id)
        if (n) n.read = true
        const { persist } = await import('./store.mjs')
        await persist('notifications')
        return sendJson(res, 200, { ok: true })
      }
      if (req.method === 'POST' && action === 'read-all') {
        for (const n of all) n.read = true
        const { persist } = await import('./store.mjs')
        await persist('notifications')
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 200, { notifications: all })
    }

    if (resource === 'deposits' && req.method === 'POST') {
      const { amount, txReference } = body || {}
      const deposit = await confirmDeposit({ userId: user.id, amount, txReference })
      return sendJson(res, 200, { deposit, portfolio: await getPortfolio(user.id) })
    }

    if (resource === 'withdrawals' && req.method === 'POST') {
      const { amount } = body || {}
      const withdrawal = await requestWithdrawal({ userId: user.id, amount })
      return sendJson(res, 200, { withdrawal, portfolio: await getPortfolio(user.id) })
    }

    if (resource === 'trades' && req.method === 'POST') {
      const { marketId, side, amount, signature, signedMessage } = body || {}
      const result = await placeTrade({ userId: user.id, marketId, side, amount, signature, signedMessage })
      return sendJson(res, 200, { ...result, portfolio: await getPortfolio(user.id) })
    }

    // Admin routes
    const admin = user.is_admin || isAdminWallet(auth.walletAddress) || isAdminWallet(auth.nametag)
    if (!admin) return sendJson(res, 403, { error: 'Admin access required' })

    if (resource === 'admin' && id === 'markets' && req.method === 'POST' && !action) {
      const market = await createMarket({ userId: user.id, ...body })
      return sendJson(res, 200, { market })
    }

    if (resource === 'admin' && id === 'markets' && action === 'close' && parts[3]) {
      const market = await closeMarket(parts[3])
      return sendJson(res, 200, { market })
    }

    if (resource === 'admin' && id === 'markets' && action === 'resolve' && parts[3]) {
      const { resolution } = body || {}
      const result = await resolveMarket({ marketId: parts[3], resolution })
      return sendJson(res, 200, result)
    }

    if (resource === 'admin' && id === 'deposits') {
      const deposits = await getDeposits()
      return sendJson(res, 200, { deposits })
    }

    if (resource === 'admin' && id === 'withdrawals') {
      const withdrawals = await getWithdrawals()
      return sendJson(res, 200, { withdrawals })
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    return sendJson(res, 400, { error: err?.message || 'Request failed' })
  }
}

function sendJson(res, statusCode, data) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wallet-Address, X-Wallet-Nametag, X-Wallet-Pubkey')
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}