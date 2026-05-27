import { useState, useEffect, useCallback } from 'react'
import { buildSignedPayload, verifyPayloadSignature, encodeMarketPacket, decodeMarketPacket } from './lib/marketProtocol'

const STORAGE_KEY = 'sphere-predict-markets-v2'

const SEED_MARKETS = [
  { id: 'm1', category: 'CRYPTO', status: 'open', question: 'Will ETH surpass BTC in market cap by Q4 2026?', deadline: Date.now() + 90 * 864e5, yesPool: 3200, noPool: 800, bets: [] },
  { id: 'm2', category: 'FINANCE', status: 'open', question: 'Will the US Federal Reserve cut rates in June 2026?', deadline: Date.now() + 28 * 864e5, yesPool: 1500, noPool: 2100, bets: [] },
  { id: 'm3', category: 'CRYPTO', status: 'open', question: 'Will a Layer 2 blockchain exceed 10M daily transactions by July 2026?', deadline: Date.now() + 45 * 864e5, yesPool: 900, noPool: 600, bets: [] },
  { id: 'm4', category: 'TECH', status: 'open', question: 'Will Sphere SDK reach 1,000 GitHub stars by September 2026?', deadline: Date.now() + 120 * 864e5, yesPool: 400, noPool: 1100, bets: [] },
  { id: 'm5', category: 'CRYPTO', status: 'closed', question: 'Will BTC hold above $80k through all of June 2026?', deadline: Date.now() - 2 * 864e5, yesPool: 5000, noPool: 2000, bets: [], resolution: null },
  { id: 'm6', category: 'TECH', status: 'resolved', question: 'Will Anthropic release a new flagship model before July 2026?', deadline: Date.now() - 10 * 864e5, yesPool: 3000, noPool: 1000, bets: [], resolution: 'YES' },
  { id: 'm7', category: 'POLITICS', status: 'open', question: 'Will there be a G7 emergency summit on AI regulation in 2026?', deadline: Date.now() + 60 * 864e5, yesPool: 700, noPool: 2300, bets: [] },
  { id: 'm8', category: 'SPORTS', status: 'open', question: 'Will any team score 200+ points in an NBA game by 2027?', deadline: Date.now() + 200 * 864e5, yesPool: 250, noPool: 1750, bets: [] },
]

function cloneSeedMarkets() {
  return SEED_MARKETS.map(market => ({ ...market, createdAt: Date.now() }))
}

function normalizeBet(bet) {
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

function normalizeMarket(market) {
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

function mergeMarketRecord(existing, incoming) {
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

function loadMarkets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeMarket).filter(Boolean)
    }
  } catch { /* ignore */ }
  return cloneSeedMarkets()
}

function saveMarkets(markets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markets))
  } catch { /* ignore */ }
}

function escrowForMarket(market, identity) {
  return market.escrowAddress || identity?.nametag || identity?.directAddress
}

export function useMarkets({ identity, sendPayment, refreshBalance, signMessage, sendDM }) {
  const [markets, setMarkets] = useState(loadMarkets)
  const [positions, setPositions] = useState([])

  useEffect(() => {
    saveMarkets(markets)
  }, [markets])

  const persist = useCallback((updater) => {
    setMarkets(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return next
    })
  }, [])

  const signSphereRecord = useCallback(async (kind, data) => {
    if (!signMessage) throw new Error('Connect your Sphere wallet first')
    const signedMessage = buildSignedPayload(kind, data)
    const { signature, publicKey } = await signMessage(signedMessage)
    return { signedMessage, signature, publicKey }
  }, [signMessage])

  const emitMarketPacket = useCallback(async (type, market, payload = {}, recipients = []) => {
    const packet = {
      protocol: 'sphere-predict-v1',
      type,
      marketId: market.id,
      payload,
      createdAt: Date.now(),
    }
    const signed = await signSphereRecord(`market:${type}`, packet)
    const shareCode = encodeMarketPacket({ ...packet, ...signed })

    if (sendDM && recipients.length) {
      await Promise.all(recipients.filter(Boolean).map(recipient => sendDM({ recipient, content: shareCode }).catch(() => null)))
    }

    return { ...packet, ...signed, shareCode }
  }, [sendDM, signSphereRecord])

  const importMarketShare = useCallback(async (content) => {
    const packet = decodeMarketPacket(content)
    if (!packet || packet.protocol !== 'sphere-predict-v1') return null
    if (!verifyPayloadSignature(packet.signedMessage, packet.signature, packet.publicKey)) return null

    if (packet.type === 'create') {
      const incoming = normalizeMarket({
        id: packet.marketId,
        ...packet.payload,
        ...packet,
        shareCode: content,
      })
      if (!incoming?.id) return null
      persist(prev => {
        const idx = prev.findIndex(m => m.id === incoming.id)
        if (idx === -1) return [incoming, ...prev]
        const next = [...prev]
        next[idx] = mergeMarketRecord(next[idx], incoming)
        return next
      })
      return incoming
    }

    if (packet.type === 'bet') {
      const bet = normalizeBet(packet.payload)
      if (!bet?.marketId) return null
      persist(prev => prev.map(m => {
        if (m.id !== bet.marketId) return m
        const updated = {
          ...m,
          bets: [...(m.bets || []), bet],
          yesPool: bet.side === 'YES' ? (m.yesPool || 0) + Number(bet.amount || 0) : (m.yesPool || 0),
          noPool: bet.side === 'NO' ? (m.noPool || 0) + Number(bet.amount || 0) : (m.noPool || 0),
        }
        return normalizeMarket(updated)
      }))
      return bet
    }

    if (packet.type === 'resolve') {
      const resolution = packet.payload?.resolution
      if (!packet.marketId || !resolution) return null
      persist(prev => prev.map(m => {
        if (m.id !== packet.marketId) return m
        return normalizeMarket({
          ...m,
          status: 'resolved',
          resolution,
          ...packet,
          resolutionProof: { signedMessage: packet.signedMessage, signature: packet.signature, publicKey: packet.publicKey, verified: true },
          shareCode: content,
        })
      }))
      return { marketId: packet.marketId, resolution }
    }

    return null
  }, [persist])

  const createMarket = useCallback(async ({ question, category, daysOpen }) => {
    if (!identity) throw new Error('Connect your Sphere wallet first')

    const id = 'mkt_' + Date.now()
    const escrow = identity.nametag || identity.directAddress
    const marketData = {
      id,
      question,
      category,
      deadline: Date.now() + daysOpen * 86_400_000,
      createdAt: Date.now(),
      createdBy: escrow,
      escrowAddress: escrow,
    }
    const proof = await signSphereRecord('market:create', marketData)

    const market = {
      id,
      type: 'MARKET_CREATE',
      ...marketData,
      yesPool: 0,
      noPool: 0,
      bets: [],
      status: 'open',
      ...proof,
      proof: { verified: true, signed: true, publicKey: proof.publicKey },
    }

    const createdPacket = await emitMarketPacket('create', market, marketData, [escrow])

    persist(prev => [{ ...market, shareCode: createdPacket.shareCode }, ...prev])
    return { ...market, shareCode: createdPacket.shareCode }
  }, [identity, persist, signSphereRecord, emitMarketPacket])

  const placeBet = useCallback(async ({ market, side, amountHuman }) => {
    if (!identity) throw new Error('Connect your Sphere wallet first')

    const recipient = escrowForMarket(market, identity)
    if (!recipient) throw new Error('Market escrow address missing')

    const betId = 'bet_' + Date.now()
    const memo = `SPHERE_PREDICT:${market.id}:${side}`
    const who = identity.nametag || identity.directAddress
    const betData = {
      betId,
      marketId: market.id,
      side,
      amount: Number(amountHuman),
      who,
      recipient,
      memo,
      ts: Date.now(),
    }
    const proof = await signSphereRecord('market:bet', betData)

    const result = await sendPayment({
      recipient,
      amountHuman,
      coinId: 'UCT',
      memo,
    })

    const betRecord = {
      type: 'MARKET_BET',
      ...betData,
      txId: result?.transferId || result?.id || 'tx_' + Date.now(),
      ...proof,
    }

    const updatedMarket = {
      ...market,
      bets: [...(market.bets || []), normalizeBet(betRecord)],
      yesPool: side === 'YES' ? (market.yesPool || 0) + Number(amountHuman) : (market.yesPool || 0),
      noPool: side === 'NO' ? (market.noPool || 0) + Number(amountHuman) : (market.noPool || 0),
    }

    persist(prev => prev.map(m => {
      if (m.id !== market.id) return m
      return {
        ...updatedMarket,
      }
    }))

    await emitMarketPacket('bet', updatedMarket, betRecord, [market.createdBy, market.escrowAddress])

    const pool = side === 'YES' ? (market.yesPool || 0) : (market.noPool || 0)
    const newPool = pool + Number(amountHuman)
    const totalPool = (market.yesPool || 0) + (market.noPool || 0) + Number(amountHuman)
    const potentialPayout = Math.round((Number(amountHuman) / newPool) * totalPool)

    setPositions(prev => [...prev, {
      marketId: market.id,
      question: market.question,
      side,
      stake: Number(amountHuman),
      potentialPayout,
      status: 'pending',
    }])

    if (refreshBalance) await refreshBalance()
    return betRecord
  }, [identity, sendPayment, refreshBalance, persist, signSphereRecord, emitMarketPacket])

  const resolveMarket = useCallback(async ({ market, resolution }) => {
    if (!identity) throw new Error('Connect your Sphere wallet first')
    const resolutionData = {
      marketId: market.id,
      resolution,
      resolvedAt: Date.now(),
      resolvedBy: identity.nametag || identity.directAddress,
    }
    const proof = await signSphereRecord('market:resolve', resolutionData)

    persist(prev => prev.map(m =>
      m.id === market.id ? { ...m, status: 'resolved', resolution, ...proof, resolutionProof: { ...proof, verified: true } } : m
    ))

    setPositions(prev => prev.map(p => {
      if (p.marketId !== market.id) return p
      return { ...p, status: p.side === resolution ? 'won' : 'lost' }
    }))

    const winners = (market.bets || []).filter(b => b.side === resolution)
    const totalWinnerStake = winners.reduce((s, b) => s + b.amount, 0)
    const loserPool = resolution === 'YES' ? (market.noPool || 0) : (market.yesPool || 0)

    for (const winner of winners) {
      if (!winner.who || totalWinnerStake <= 0) continue
      const share = winner.amount / totalWinnerStake
      const payout = winner.amount + Math.floor(loserPool * share)
      if (payout > 0) {
        try {
          await sendPayment({
            recipient: winner.who,
            amountHuman: payout,
            coinId: 'UCT',
            memo: `SPHERE_PREDICT_PAYOUT:${market.id}`,
          })
        } catch (err) {
          console.warn('Payout failed for', winner.who, err)
        }
      }
    }

    const resolvedMarket = {
      ...market,
      status: 'resolved',
      resolution,
      ...proof,
      resolutionProof: { ...proof, verified: true },
    }

    const recipients = [market.createdBy, market.escrowAddress, ...(market.bets || []).map(b => b.who)]
    await emitMarketPacket('resolve', resolvedMarket, resolutionData, recipients)

    if (refreshBalance) await refreshBalance()
    return { marketId: market.id, resolution }
  }, [identity, sendPayment, refreshBalance, persist, signSphereRecord, emitMarketPacket])

  return {
    markets,
    positions,
    createMarket,
    placeBet,
    resolveMarket,
    importMarketShare,
  }
}
