/** UCT decimals per TokenRegistry (8 on testnet2). */
export const DEFAULT_UCT_DECIMALS = Number(process.env.UCT_DECIMALS || 8)

/** Ledger amounts are numeric(18,4) in Postgres. */
export const LEDGER_AMOUNT_DECIMALS = 4

/**
 * Convert a ledger human amount to raw smallest units (bigint, no float drift).
 */
export function humanToRawBigInt(human, decimals = DEFAULT_UCT_DECIMALS) {
  const n = Number(human)
  if (!Number.isFinite(n) || n <= 0) return 0n

  const fixed = n.toFixed(LEDGER_AMOUNT_DECIMALS)
  const neg = fixed.startsWith('-')
  const [whole, frac = ''] = fixed.replace(/^-/, '').split('.')
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
  const base = 10n ** BigInt(decimals)
  const raw = BigInt(whole || '0') * base + BigInt(fracPadded || '0')
  return neg ? -raw : raw
}

export function toRawString(human, decimals = DEFAULT_UCT_DECIMALS) {
  return String(humanToRawBigInt(human, decimals))
}

export function rawToHuman(raw, decimals = DEFAULT_UCT_DECIMALS) {
  const v = BigInt(String(raw || 0))
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  if (frac === 0n) return Number(whole)
  return Number(whole) + Number(frac) / Number(base)
}