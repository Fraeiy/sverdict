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
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} UCT`
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

/** Human-readable age since an ISO timestamp (e.g. "67m ago"). */
export function formatAge(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'never'
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export type WorkerHealth = 'ok' | 'delayed' | 'stale' | 'unknown'

/** Treasury worker freshness from last treasury_status publish. */
export function workerHealthFromAge(ageMs: number | null): WorkerHealth {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'unknown'
  if (ageMs < 20 * 60_000) return 'ok'
  if (ageMs < 120 * 60_000) return 'delayed'
  return 'stale'
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