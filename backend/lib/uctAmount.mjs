import { DEFAULT_UCT_DECIMALS, rawToHuman } from './amount.mjs'
import { getUctDecimals } from './sphereProviders.mjs'

/** Authoritative UCT decimals — never treat 0 from registry as valid. */
export function resolveUctDecimals(explicit) {
  const n = Number(explicit ?? getUctDecimals())
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_UCT_DECIMALS || 8
}

export function roundLedgerUct(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 10000) / 10000
}

/** Human UCT above this is almost certainly raw smallest-units stored by mistake. */
export const RAW_MISTAKE_HUMAN_THRESHOLD = 1_000_000

export function looksLikeRawMistake(human) {
  return Number(human) > RAW_MISTAKE_HUMAN_THRESHOLD
}

export function humanFromRawMaybeMistaken(human, raw, decimals = resolveUctDecimals()) {
  const rawStr = String(raw || '0')
  if (rawStr !== '0' && BigInt(rawStr) > 0n) {
    const fromRaw = rawToHuman(BigInt(rawStr), decimals)
    if (looksLikeRawMistake(human) && fromRaw < Number(human)) {
      return roundLedgerUct(fromRaw)
    }
  }
  if (looksLikeRawMistake(human)) {
    return roundLedgerUct(rawToHuman(BigInt(String(Math.trunc(Number(human)))), decimals))
  }
  return roundLedgerUct(human)
}