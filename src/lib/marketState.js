import { verifyPayloadSignature } from './marketProtocol'

export const SEED_MARKETS = [
  { id: 'm1', category: 'CRYPTO', status: 'open', question: 'Will ETH surpass BTC in market cap by Q4 2026?', deadline: Date.now() + 90 * 864e5, yesPool: 3200, noPool: 800, bets: [] },
  { id: 'm2', category: 'FINANCE', status: 'open', question: 'Will the US Federal Reserve cut rates in June 2026?', deadline: Date.now() + 28 * 864e5, yesPool: 1500, noPool: 2100, bets: [] },
  { id: 'm3', category: 'CRYPTO', status: 'open', question: 'Will a Layer 2 blockchain exceed 10M daily transactions by July 2026?', deadline: Date.now() + 45 * 864e5, yesPool: 900, noPool: 600, bets: [] },
  { id: 'm4', category: 'TECH', status: 'open', question: 'Will Sphere SDK reach 1,000 GitHub stars by September 2026?', deadline: Date.now() + 120 * 864e5, yesPool: 400, noPool: 1100, bets: [] },
  { id: 'm5', category: 'CRYPTO', status: 'closed', question: 'Will BTC hold above $80k through all of June 2026?', deadline: Date.now() - 2 * 864e5, yesPool: 5000, noPool: 2000, bets: [], resolution: null },
  { id: 'm6', category: 'TECH', status: 'resolved', question: 'Will Anthropic release a new flagship model before July 2026?', deadline: Date.now() - 10 * 864e5, yesPool: 3000, noPool: 1000, bets: [], resolution: 'YES' },
  { id: 'm7', category: 'POLITICS', status: 'open', question: 'Will there be a G7 emergency summit on AI regulation in 2026?', deadline: Date.now() + 60 * 864e5, yesPool: 700, noPool: 2300, bets: [] },
  { id: 'm8', category: 'SPORTS', status: 'open', question: 'Will any team score 200+ points in an NBA game by 2027?', deadline: Date.now() + 200 * 864e5, yesPool: 250, noPool: 1750, bets: [] },
]

export function cloneSeedMarkets() {
  return SEED_MARKETS.map(market => ({ ...market, createdAt: Date.now() }))
}

export function normalizeBet(bet) {
  if (!bet || typeof bet !== 'object') return null
  const signedMessage = bet.signedMessage || null
  const signature = bet.signature || null
  const publicKey = bet.publicKey || null
  const verified = Boolean(signedMessage && signature && publicKey && verifyPayloadSignature(signedMessage, signature, publicKey))
  return {
    ...bet,
    verified,
  }
}

export function normalizeMarket(market) {
  if (!market || typeof market !== 'object') return null
  const bets = Array.isArray(market.bets) ? market.bets.map(normalizeBet).filter(Boolean) : []
  const signedMessage = market.signedMessage || null
  const signature = market.signature || null
  const publicKey = market.publicKey || null
  const verified = Boolean(signedMessage && signature && publicKey && verifyPayloadSignature(signedMessage, signature, publicKey))
  return {
    ...market,
    bets,
    proof: {
      verified,
      signed: Boolean(signature),
      publicKey,
    },
    shareCode: market.shareCode || null,
  }
}

export function mergeMarketRecord(existing, incoming) {
  if (!existing) return incoming
  const betsById = new Map((existing.bets || []).map(bet => [bet.betId || bet.txId || `${bet.marketId}:${bet.ts}`, bet]))
  for (const bet of incoming.bets || []) {
    const key = bet.betId || bet.txId || `${bet.marketId}:${bet.ts}`
    betsById.set(key, bet)
  }
  return {
    ...existing,
    ...incoming,
    bets: [...betsById.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    yesPool: Number(incoming.yesPool ?? existing.yesPool ?? 0),
    noPool: Number(incoming.noPool ?? existing.noPool ?? 0),
  }
}

function betKey(bet) {
  return bet?.betId || bet?.txId || `${bet?.marketId || 'unknown'}:${bet?.ts || '0'}`
}

export function applyMarketPacket(markets, packet, content) {
  if (!packet || packet.protocol !== 'sphere-predict-v1') return { markets, result: null, changed: false }
  if (!verifyPayloadSignature(packet.signedMessage, packet.signature, packet.publicKey)) {
    return { markets, result: null, changed: false }
  }

  if (packet.type === 'create') {
    const incoming = normalizeMarket({
      id: packet.marketId,
      ...packet.payload,
      ...packet,
      shareCode: content,
    })
    if (!incoming?.id) return { markets, result: null, changed: false }
    const idx = markets.findIndex(market => market.id === incoming.id)
    if (idx === -1) {
      return { markets: [incoming, ...markets], result: incoming, changed: true }
    }
    const next = [...markets]
    next[idx] = mergeMarketRecord(next[idx], incoming)
    return { markets: next, result: incoming, changed: true }
  }

  if (packet.type === 'bet') {
    const bet = normalizeBet(packet.payload)
    if (!bet?.marketId) return { markets, result: null, changed: false }
    const key = betKey(bet)
    let changed = false
    const next = markets.map(market => {
      if (market.id !== bet.marketId) return market
      if ((market.bets || []).some(existingBet => betKey(existingBet) === key)) return market
      changed = true
      const updated = {
        ...market,
        bets: [...(market.bets || []), bet],
        yesPool: bet.side === 'YES' ? (market.yesPool || 0) + Number(bet.amount || 0) : (market.yesPool || 0),
        noPool: bet.side === 'NO' ? (market.noPool || 0) + Number(bet.amount || 0) : (market.noPool || 0),
      }
      return normalizeMarket(updated)
    })
    return { markets: next, result: bet, changed }
  }

  if (packet.type === 'resolve') {
    const resolution = packet.payload?.resolution
    if (!packet.marketId || !resolution) return { markets, result: null, changed: false }
    let changed = false
    const next = markets.map(market => {
      if (market.id !== packet.marketId) return market
      if (market.status === 'resolved' && market.resolution === resolution) return market
      changed = true
      return normalizeMarket({
        ...market,
        status: 'resolved',
        resolution,
        ...packet,
        resolutionProof: { signedMessage: packet.signedMessage, signature: packet.signature, publicKey: packet.publicKey, verified: true },
        shareCode: content,
      })
    })
    return { markets: next, result: { marketId: packet.marketId, resolution }, changed }
  }

  return { markets, result: null, changed: false }
}
