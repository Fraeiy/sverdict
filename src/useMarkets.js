import { useState, useEffect, useCallback } from 'react'

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

function loadMarkets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch { /* ignore */ }
  return SEED_MARKETS.map(m => ({ ...m, createdAt: Date.now() }))
}

function saveMarkets(markets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markets))
  } catch { /* ignore */ }
}

function escrowForMarket(market, identity) {
  return market.escrowAddress || identity?.nametag || identity?.directAddress
}

export function useMarkets({ identity, sendPayment, refreshBalance }) {
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

  const createMarket = useCallback(async ({ question, category, daysOpen }) => {
    if (!identity) throw new Error('Connect your Sphere wallet first')

    const id = 'mkt_' + Date.now()
    const escrow = identity.nametag || identity.directAddress

    const market = {
      id,
      type: 'MARKET_CREATE',
      question,
      category,
      deadline: Date.now() + daysOpen * 86_400_000,
      createdAt: Date.now(),
      createdBy: escrow,
      escrowAddress: escrow,
      yesPool: 0,
      noPool: 0,
      bets: [],
      status: 'open',
    }

    persist(prev => [market, ...prev])
    return market
  }, [identity, persist])

  const placeBet = useCallback(async ({ market, side, amountHuman }) => {
    if (!identity) throw new Error('Connect your Sphere wallet first')

    const recipient = escrowForMarket(market, identity)
    if (!recipient) throw new Error('Market escrow address missing')

    const memo = `SPHERE_PREDICT:${market.id}:${side}`

    const result = await sendPayment({
      recipient,
      amountHuman,
      coinId: 'UCT',
      memo,
    })

    const who = identity.nametag || identity.directAddress
    const betRecord = {
      type: 'MARKET_BET',
      marketId: market.id,
      side,
      amount: Number(amountHuman),
      who,
      txId: result?.transferId || result?.id || 'tx_' + Date.now(),
      ts: Date.now(),
    }

    persist(prev => prev.map(m => {
      if (m.id !== market.id) return m
      return {
        ...m,
        bets: [...(m.bets || []), betRecord],
        yesPool: side === 'YES' ? (m.yesPool || 0) + Number(amountHuman) : (m.yesPool || 0),
        noPool: side === 'NO' ? (m.noPool || 0) + Number(amountHuman) : (m.noPool || 0),
      }
    }))

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
  }, [identity, sendPayment, refreshBalance, persist])

  const resolveMarket = useCallback(async ({ market, resolution }) => {
    if (!identity) throw new Error('Connect your Sphere wallet first')

    persist(prev => prev.map(m =>
      m.id === market.id ? { ...m, status: 'resolved', resolution } : m
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

    if (refreshBalance) await refreshBalance()
    return { marketId: market.id, resolution }
  }, [identity, sendPayment, refreshBalance, persist])

  return {
    markets,
    positions,
    createMarket,
    placeBet,
    resolveMarket,
  }
}
