import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMarketPacket, cloneSeedMarkets, normalizeMarket } from './lib/marketState.mjs'
import { decodeMarketPacket } from './lib/marketProtocol.mjs'
import { initTreasurySphere } from './lib/sphereProviders.mjs'
import { buildWithdrawMemo } from './lib/paymentMemos.mjs'
import { initPlatform } from './platform/engine.mjs'
import { handlePlatformApi } from './platform/routes.mjs'
import { setTreasury } from './platform/store.mjs'

const PORT = Number(process.env.MARKET_API_PORT || process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(ROOT_DIR, '..')
const DIST_DIR = path.join(APP_DIR, 'dist')

// Persistence directory. Override with DATA_DIR for a custom data path.
// Default keeps data next to this file for local/dev runs.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data')
const DATA_FILE = path.join(DATA_DIR, 'markets.json')
const BALANCES_FILE = path.join(DATA_DIR, 'balances.json')

let markets = cloneSeedMarkets()
let userBalances = {}
let treasurySphere = null
let TREASURY_ADDRESS = ''

const clients = new Set()

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

/**
 * Robust load:
 * - If the data file exists and parses to a non-empty array, use it.
 * - Otherwise (first run, or empty/corrupt file), seed from SEED_MARKETS
 *   and immediately persist so the file exists as a baseline for future loads.
 */
async function loadMarkets() {
  try {
    await ensureDataDir()
    if (!existsSync(DATA_FILE)) {
      // First ever run for this persistent store — initialize with seeds and save.
      markets = cloneSeedMarkets()
      await saveMarkets()
      return
    }

    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      markets = parsed.map(normalizeMarket).filter(Boolean)
      return
    }

    // File existed but was empty or invalid — (re)initialize from seeds and save.
    markets = cloneSeedMarkets()
    await saveMarkets()
  } catch (err) {
    console.warn('Failed to load markets from disk, falling back to seeds:', err?.message || err)
    markets = cloneSeedMarkets()
    try { await saveMarkets() } catch {}
  }
}

async function saveMarkets() {
  await ensureDataDir()
  const tmp = DATA_FILE + '.tmp'
  // Atomic write: write to .tmp then rename to avoid partial/corrupt files on crash.
  await writeFile(tmp, JSON.stringify(markets, null, 2), 'utf8')
  await rename(tmp, DATA_FILE)
}

async function loadBalances() {
  try {
    await ensureDataDir()
    if (!existsSync(BALANCES_FILE)) {
      userBalances = {}
      return
    }
    const raw = await readFile(BALANCES_FILE, 'utf8')
    userBalances = JSON.parse(raw) || {}
  } catch {
    userBalances = {}
  }
}

async function saveBalances() {
  await ensureDataDir()
  const tmp = BALANCES_FILE + '.tmp'
  await writeFile(tmp, JSON.stringify(userBalances, null, 2), 'utf8')
  await rename(tmp, BALANCES_FILE)
}

function getBalance(address) {
  if (!address) return 0
  return userBalances[address] || 0
}

function creditBalance(address, amount) {
  if (!address) return
  const current = getBalance(address)
  userBalances[address] = current + Number(amount || 0)
  saveBalances().catch(console.warn)
}

function debitBalance(address, amount) {
  if (!address) return false
  const current = getBalance(address)
  const needed = Number(amount || 0)
  if (current < needed) return false
  userBalances[address] = current - needed
  saveBalances().catch(console.warn)
  return true
}

async function initTreasury() {
  try {
    const mnemonic = process.env.TREASURY_MNEMONIC
    if (!mnemonic) {
      console.warn('⚠️  No TREASURY_MNEMONIC env var set. Using auto-generated treasury wallet for this run. Set TREASURY_MNEMONIC for persistent treasury.')
    }
    treasurySphere = await initTreasurySphere({
      mnemonic: mnemonic || undefined,
      autoGenerate: !mnemonic,
    })
    TREASURY_ADDRESS = sphere.identity?.directAddress || 'unknown'
    console.log('Treasury wallet ready. Address for deposits:', TREASURY_ADDRESS)
  } catch (err) {
    console.error('Failed to initialize treasury wallet:', err)
    TREASURY_ADDRESS = 'treasury-init-failed'
  }
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res, statusCode, data) {
  setCommonHeaders(res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.map': 'application/json; charset=utf-8',
  }[ext] || 'application/octet-stream'

  return readFile(filePath).then(buffer => {
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' })
    res.end(buffer)
  })
}

function resolveStaticFile(urlPath) {
  if (!existsSync(DIST_DIR)) return null
  const normalized = path.normalize(urlPath).replace(/^([/\\])+/, '')
  const candidate = path.resolve(DIST_DIR, normalized)
  if (!candidate.startsWith(DIST_DIR)) return null
  if (existsSync(candidate) && !candidate.endsWith(path.sep)) return candidate
  return null
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function broadcastMarket(content) {
  const payload = `event: market\ndata: ${JSON.stringify({ content })}\n\n`
  for (const res of clients) {
    res.write(payload)
  }
}

async function handlePacket(content) {
  const packet = decodeMarketPacket(content)
  if (!packet) return { applied: false, packet: null, outcome: null }

  // Handle deposit: credit internal balance (user sent UCT on-chain to treasury)
  if (packet.type === 'deposit') {
    const who = packet.who || packet.payload?.who
    const amount = packet.payload?.amount || packet.amount
    if (who && amount) {
      creditBalance(who, amount)
    }
    broadcastMarket(content)
    return { applied: true, packet, outcome: { result: { type: 'deposit' }, changed: true } }
  }

  // Handle withdraw request: debit internal + send from treasury (server-controlled)
  if (packet.type === 'withdraw') {
    const who = packet.who || packet.payload?.who
    const amount = packet.payload?.amount || packet.amount
    if (who && amount && debitBalance(who, amount)) {
      if (treasurySphere) {
        try {
          await treasurySphere.payments.send({
            recipient: who,
            amount: String(amount),
            coinId: 'UCT',
            memo: buildWithdrawMemo(packet.id || who)
          })
        } catch (e) {
          console.warn('Treasury withdraw send failed, re-crediting balance:', e?.message || e)
          creditBalance(who, amount) // rollback on failure
          return { applied: false, packet, outcome: { error: 'withdraw_failed' } }
        }
      }
      broadcastMarket(content)
      return { applied: true, packet, outcome: { result: { type: 'withdraw' }, changed: true } }
    }
    return { applied: false, packet, outcome: { error: 'insufficient_balance' } }
  }

  const outcome = applyMarketPacket(markets, packet, content)
  if (!outcome.result || !outcome.changed) return { applied: false, packet, outcome }

  // Internal ledger integration for bets (no on-chain per-bet transfer)
  if (packet.type === 'bet') {
    const bet = packet.payload || {}
    const who = bet.who || packet.who
    const betAmount = bet.amount || 0
    const m = markets.find(mm => mm.id === packet.marketId)
    if (m && m.status !== 'open') {
      console.warn('Bet rejected: market not open')
      return { applied: false, packet, outcome: { ...outcome, error: 'market_not_open' } }
    }
    if (who && betAmount > 0) {
      if (!debitBalance(who, betAmount)) {
        // Not enough internal balance - do not apply the bet to markets
        console.warn(`Bet rejected for ${who}: insufficient internal balance`)
        return { applied: false, packet, outcome: { ...outcome, error: 'insufficient_internal_balance' } }
      }
    }
  }

  // On resolve, credit winner balances internally from the ledger (instead of admin doing many sends)
  if (packet.type === 'resolve') {
    const res = packet.payload || {}
    const resolution = res.resolution
    const marketId = packet.marketId
    // Find the market (after apply it is in markets)
    const m = markets.find(mm => mm.id === marketId)
    if (m && resolution) {
      const winners = (m.bets || []).filter(b => b.side === resolution)
      const totalWinnerStake = winners.reduce((s, b) => s + (b.amount || 0), 0)
      const loserPool = resolution === 'YES' ? (m.noPool || 0) : (m.yesPool || 0)
      for (const winner of winners) {
        if (!winner.who || totalWinnerStake <= 0) continue
        const share = (winner.amount || 0) / totalWinnerStake
        const payout = (winner.amount || 0) + Math.floor(loserPool * share)
        if (payout > 0) {
          creditBalance(winner.who, payout)
        }
      }
    }
  }

  markets = outcome.markets
  await saveMarkets()
  broadcastMarket(content)
  return { applied: true, packet, outcome }
}

await loadMarkets()
await loadBalances()
await initTreasury()
await initPlatform()
if (TREASURY_ADDRESS) await setTreasury(TREASURY_ADDRESS)

const server = createServer(async (req, res) => {
  setCommonHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  // Platform API (Polymarket-style internal ledger)
  const platformPaths = [
    '/api/health', '/api/treasury', '/api/auth', '/api/portfolio',
    '/api/notifications', '/api/deposits', '/api/withdrawals', '/api/trades',
    '/api/markets', '/api/admin',
  ]
  if (platformPaths.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) {
    let body = {}
    if (req.method === 'POST') {
      try { body = await readBody(req) } catch { body = {} }
    }
    await handlePlatformApi(req, res, url.pathname, body)
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/markets') {
    sendJson(res, 200, { markets, treasuryAddress: TREASURY_ADDRESS })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/balance') {
    const addr = url.searchParams.get('address')
    sendJson(res, 200, { balance: getBalance(addr) })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    })
    res.write(': connected\n\n')
    clients.add(res)
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, 25000)
    req.on('close', () => {
      clearInterval(heartbeat)
      clients.delete(res)
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/market-packets') {
    try {
      const body = await readBody(req)
      const content = body.content || body.shareCode || body.packet
      if (!content || typeof content !== 'string') {
        sendJson(res, 400, { ok: false, error: 'Missing market packet content' })
        return
      }
      const outcome = await handlePacket(content)
      if (!outcome.applied) {
        sendJson(res, 200, { ok: true, applied: false, markets })
        return
      }
      sendJson(res, 200, { ok: true, applied: true, marketId: outcome.packet.marketId, type: outcome.packet.type })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' })
    }
    return
  }

  if (req.method === 'GET') {
    const assetPath = url.pathname === '/' ? path.join(DIST_DIR, 'index.html') : resolveStaticFile(url.pathname.slice(1))
    if (assetPath) {
      await sendFile(res, assetPath)
      return
    }
    if (existsSync(path.join(DIST_DIR, 'index.html'))) {
      await sendFile(res, path.join(DIST_DIR, 'index.html'))
      return
    }
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`Market API listening on http://${HOST}:${PORT}`)
})
