import { BRAND_NAME } from './brand'
import { getSiteUrl } from './config'
import type { Market, Position } from './types'
import { fmtUct, noProbability, yesProbability } from './format'

export function appOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return getSiteUrl()
}

/** Compact market id for URLs — first 8 hex chars of UUID. */
export function shortMarketCode(marketId: string) {
  return marketId.replace(/-/g, '').slice(0, 8).toLowerCase()
}

export function isShortMarketCode(id: string) {
  return /^[0-9a-f]{6,12}$/i.test(id.replace(/-/g, ''))
}

export function marketSharePath(marketId: string) {
  return `/s/${shortMarketCode(marketId)}`
}

export function marketShareUrl(marketId: string) {
  return `${appOrigin()}${marketSharePath(marketId)}`
}

export type PositionShareParams = {
  side: string
  stake: number
  pnl: number
  value?: number
  by?: string
}

/** Compact query: p=YES,25,5,fraey */
export function encodePositionShareQuery(params: PositionShareParams) {
  const parts = [
    params.side,
    String(params.stake),
    String(params.pnl),
  ]
  if (params.value != null) parts.push(String(params.value))
  if (params.by) parts.push(params.by.replace(/^@/, ''))
  return parts.join(',')
}

export function positionSharePath(marketId: string, params: PositionShareParams) {
  const q = encodePositionShareQuery(params)
  return `${marketSharePath(marketId)}?p=${encodeURIComponent(q)}`
}

export function positionShareUrl(marketId: string, params: PositionShareParams) {
  return `${appOrigin()}${positionSharePath(marketId, params)}`
}

export function marketShareText(market: Pick<Market, 'id' | 'question' | 'yes_pool' | 'no_pool' | 'yes_probability'>) {
  const yes = yesProbability(market as Market)
  const no = noProbability(market as Market)
  return [
    market.question,
    `YES ${yes}% · NO ${no}%`,
    `Trade on ${BRAND_NAME}`,
    marketShareUrl(market.id),
  ].join('\n')
}

export function positionShareText(
  position: Position,
  opts?: { trader?: string },
) {
  const outcome = position.outcome || position.side
  const stake = Number(position.stake_amount ?? position.cost_basis ?? 0)
  const value = Number(position.current_value ?? stake)
  const pnl = Number(position.unrealized_pnl ?? value - stake)
  const question = position.market?.question || 'Market position'
  const trader = opts?.trader?.replace(/^@/, '')
  const url = positionShareUrl(position.market_id, {
    side: String(outcome),
    stake,
    pnl,
    value,
    by: trader,
  })
  const lines = [
    trader ? `${trader} on ${BRAND_NAME}` : `My ${BRAND_NAME} position`,
    `${outcome} · ${question}`,
    `Staked ${fmtUct(stake)} · Est. ${fmtUct(value)} · PnL ${pnl >= 0 ? '+' : ''}${fmtUct(pnl)}`,
    url,
  ]
  return lines.join('\n')
}

export function parsePositionShareParams(search: URLSearchParams): PositionShareParams | null {
  const compact = search.get('p')
  if (compact) {
    const [side, stakeRaw, pnlRaw, valueRaw, by] = compact.split(',')
    const stake = Number(stakeRaw)
    const pnl = Number(pnlRaw)
    if (!side || !Number.isFinite(stake) || !Number.isFinite(pnl)) return null
    const value = Number(valueRaw)
    return {
      side,
      stake,
      pnl,
      value: Number.isFinite(value) ? value : undefined,
      by: by || undefined,
    }
  }

  const side = search.get('brag')
  const stake = Number(search.get('stake'))
  const pnl = Number(search.get('pnl'))
  if (!side || !Number.isFinite(stake) || !Number.isFinite(pnl)) return null
  const value = Number(search.get('value'))
  const by = search.get('by') || undefined
  return {
    side,
    stake,
    pnl,
    value: Number.isFinite(value) ? value : undefined,
    by,
  }
}

export function shareLinkLabel(url: string) {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/^\/s\//, '/…/')
    return `${u.host}${path}`
  } catch {
    return url
  }
}

export async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  return ok
}

export async function nativeShare(payload: { title: string; text: string; url?: string }) {
  if (!navigator.share) return false
  try {
    await navigator.share(payload)
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return true
    return false
  }
}