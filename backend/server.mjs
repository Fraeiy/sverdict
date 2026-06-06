import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMarketPacket, cloneSeedMarkets, normalizeMarket } from '../src/lib/marketState.js'
import { decodeMarketPacket } from '../src/lib/marketProtocol.js'

const PORT = Number(process.env.MARKET_API_PORT || process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(ROOT_DIR, '..')
const DIST_DIR = path.join(APP_DIR, 'dist')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DATA_FILE = path.join(DATA_DIR, 'markets.json')

let markets = cloneSeedMarkets()
const clients = new Set()

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

async function loadMarkets() {
  try {
    if (!existsSync(DATA_FILE)) return
    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) {
      markets = parsed.map(normalizeMarket).filter(Boolean)
    }
  } catch {
    markets = cloneSeedMarkets()
  }
}

async function saveMarkets() {
  await ensureDataDir()
  await writeFile(DATA_FILE, JSON.stringify(markets, null, 2), 'utf8')
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
  const outcome = applyMarketPacket(markets, packet, content)
  if (!outcome.result || !outcome.changed) return { applied: false, packet, outcome }
  markets = outcome.markets
  await saveMarkets()
  broadcastMarket(content)
  return { applied: true, packet, outcome }
}

await loadMarkets()

const server = createServer(async (req, res) => {
  setCommonHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/markets') {
    sendJson(res, 200, { markets })
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
