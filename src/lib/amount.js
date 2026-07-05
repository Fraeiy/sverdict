/** Default UCT decimals per TokenRegistry (8 on testnet2). Always prefer asset.decimals from wallet. */
export const UCT_DECIMALS = 8

export function toHuman(raw, decimals = UCT_DECIMALS) {
  if (raw == null) return '0'
  const rawStr = String(raw).trim()
  if (!rawStr || rawStr === '0') return '0'

  const dec = Number(decimals)
  if (!Number.isFinite(dec) || dec < 0) return rawStr

  // Some Connect responses may already return a human decimal string.
  if (rawStr.includes('.') && !rawStr.includes('e') && !rawStr.includes('E')) {
    const asNum = Number(rawStr)
    if (Number.isFinite(asNum) && asNum < 10 ** Math.min(dec, 12)) {
      return asNum.toLocaleString(undefined, { maximumFractionDigits: Math.min(dec, 8) })
    }
  }

  const n = BigInt(rawStr.split('.')[0] || '0')
  const base = 10n ** BigInt(dec)
  const whole = n / base
  const frac = n % base
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(dec, '0').replace(/0+$/, '')
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