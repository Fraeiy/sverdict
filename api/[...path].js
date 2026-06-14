import { applyMarketPacket, cloneSeedMarkets } from '../src/lib/marketState.js'
import { decodeMarketPacket } from '../src/lib/marketProtocol.js'

/**
 * WARNING: This is a stateless / serverless-friendly re-implementation of the API handlers.
 * It seeds fresh on every cold start and has NO disk persistence (no load/save, no DATA_DIR).
 * Created markets will disappear on function/instance restarts or deploys.
 *
 * The primary deployment (Docker + Fly via backend/server.mjs) has real persistence
 * via the volume + improved load/save logic.
 *
 * If you deploy this api/ handler (e.g. on Vercel), you will need an external store
 * (Upstash Redis, Fly Postgres, etc.) for real multi-user durability.
 */

let markets = cloneSeedMarkets()
const clients = new Set()

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
  broadcastMarket(content)
  return { applied: true, packet, outcome }
}

export default async function handler(req, res) {
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

  sendJson(res, 404, { ok: false, error: 'Not found' })
}