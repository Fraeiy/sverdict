/** Default UCT decimals per TokenRegistry (8 on testnet2). Always prefer asset.decimals from wallet. */
export const UCT_DECIMALS = 8

/** Max fractional digits shown in UI (wallet header, etc.). */
export const UCT_DISPLAY_DECIMALS = 2

export function formatUctDisplay(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: UCT_DISPLAY_DECIMALS,
  })
}

export function toHuman(raw, decimals = UCT_DECIMALS) {
  if (raw == null) return '0'
  const rawStr = String(raw).trim()
  if (!rawStr || rawStr === '0') return '0'

  const dec = Number(decimals)
  if (!Number.isFinite(dec) || dec < 0) return formatUctDisplay(rawStr)

  // Already a small human decimal string from Connect (fix float noise via display rounding).
  if (rawStr.includes('.') && !rawStr.includes('e') && !rawStr.includes('E')) {
    const asNum = Number(rawStr)
    if (Number.isFinite(asNum) && asNum < 10 ** Math.min(dec, 12)) {
      return formatUctDisplay(asNum)
    }
  }

  const n = BigInt(rawStr.split('.')[0] || '0')
  const base = 10n ** BigInt(dec)
  const scale = 10n ** BigInt(UCT_DISPLAY_DECIMALS)

  // Round smallest-units → human with UCT_DISPLAY_DECIMALS (bigint, no float drift).
  const scaled = (n * scale + base / 2n) / base
  const whole = scaled / scale
  const frac = scaled % scale

  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(UCT_DISPLAY_DECIMALS, '0').replace(/0+$/, '')
  if (!fracStr) return whole.toLocaleString()
  return `${whole.toLocaleString()}.${fracStr}`
}

export function toRaw(human, decimals = UCT_DECIMALS) {
  const n = Number(human)
  if (!Number.isFinite(n) || n < 0) return 0n
  const base = 10n ** BigInt(decimals)
  const whole = BigInt(Math.floor(n))
  const fracPart = n - Math.floor(n)
  const frac = BigInt(Math.round(fracPart * Number(base)))
  return whole * base + frac
}

export function toRawString(human, decimals = UCT_DECIMALS) {
  return String(toRaw(human, decimals))
}