import type { Market, Position } from './types'

/** Net profit/loss for a settled position (payout minus stake). */
export function realizedPnl(position: Pick<Position, 'pnl' | 'payout' | 'stake_amount' | 'cost_basis'>): number {
  const stake = Number(position.stake_amount ?? position.cost_basis ?? 0)
  const payout = Number(position.payout ?? 0)
  if (position.pnl != null && !Number.isNaN(Number(position.pnl))) {
    return Number(position.pnl)
  }
  return payout - stake
}

export function fmtUct(n: number) {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UCT`
}

export function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function yesProbability(m: Market) {
  if (m.yes_probability != null) return Math.round(m.yes_probability * 100)
  const t = (m.yes_pool || 0) + (m.no_pool || 0)
  if (!t) return 50
  return Math.round((m.yes_pool / t) * 100)
}

export function noProbability(m: Market) {
  return 100 - yesProbability(m)
}

export function timeRemaining(deadline: string) {
  const d = new Date(deadline).getTime() - Date.now()
  if (d < 0) return 'Ended'
  const days = Math.floor(d / 86_400_000)
  if (days > 1) return `${days}d left`
  const hrs = Math.floor(d / 3_600_000)
  if (hrs > 0) return `${hrs}h left`
  const mins = Math.floor(d / 60_000)
  if (mins > 0) return `${mins}m left`
  return 'Closing soon'
}

export function displayName(identity?: { nametag?: string; directAddress?: string } | null) {
  if (!identity) return 'Guest'
  if (identity.nametag) return identity.nametag.startsWith('@') ? identity.nametag : `@${identity.nametag}`
  return 'Sphere user'
}

export function stakeMemo(marketId: string, outcome: 'YES' | 'NO') {
  return `market:${marketId}:outcome:${outcome}`
}