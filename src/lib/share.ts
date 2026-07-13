import { BRAND_NAME } from './brand'
import type { Market, Position } from './types'
import { fmtUct, noProbability, yesProbability } from './format'

export function appOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function marketShareUrl(marketId: string) {
  return `${appOrigin()}/markets/${marketId}`
}

export type PositionShareParams = {
  side: string
  stake: number
  pnl: number
  value?: number
  by?: string
}

export function positionShareUrl(marketId: string, params: PositionShareParams) {
  const url = new URL(`${appOrigin()}/markets/${marketId}`)
  url.searchParams.set('brag', params.side)
  url.searchParams.set('stake', String(params.stake))
  url.searchParams.set('pnl', String(params.pnl))
  if (params.value != null) url.searchParams.set('value', String(params.value))
  if (params.by) url.searchParams.set('by', params.by.replace(/^@/, ''))
  return url.toString()
}

export function marketShareText(market: Pick<Market, 'id' | 'question' | 'yes_pool' | 'no_pool' | 'yes_probability'>) {
  const yes = yesProbability(market as Market)
  const no = noProbability(market as Market)
  return [
    `${market.question}`,
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
  const lines = [
    trader ? `${trader} on ${BRAND_NAME}` : `My ${BRAND_NAME} position`,
    `${outcome} · ${question}`,
    `Staked ${fmtUct(stake)} · Est. ${fmtUct(value)} · PnL ${pnl >= 0 ? '+' : ''}${fmtUct(pnl)}`,
    positionShareUrl(position.market_id, { side: String(outcome), stake, pnl, value, by: trader }),
  ]
  return lines.join('\n')
}

export function parsePositionShareParams(search: URLSearchParams): PositionShareParams | null {
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