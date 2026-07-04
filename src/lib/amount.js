/** UCT base units per TokenRegistry (8 decimals on testnet2). */
const DECIMALS = 8

export function toHuman(raw) {
  if (raw == null) return '0'
  const n = typeof raw === 'bigint' ? raw : BigInt(String(raw || 0))
  const whole = n / 10n ** BigInt(DECIMALS)
  return whole.toLocaleString()
}

export function toRaw(human) {
  return BigInt(Math.floor(Number(human))) * 10n ** BigInt(DECIMALS)
}

export function toRawString(human) {
  return String(toRaw(human))
}
