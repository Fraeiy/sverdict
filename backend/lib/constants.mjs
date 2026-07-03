/** UCT on Unicity testnet2 */
export const UCT_COIN_ID =
  process.env.UCT_COIN_ID ||
  'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0'

export const DEFAULT_UCT_DECIMALS = Number(process.env.UCT_DECIMALS || 18)

export function toRawString(human, decimals = DEFAULT_UCT_DECIMALS) {
  const n = BigInt(Math.floor(Number(human)))
  const base = 10n ** BigInt(decimals)
  return String(n * base)
}

export function rawToHuman(raw, decimals = DEFAULT_UCT_DECIMALS) {
  const v = BigInt(String(raw || 0))
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  if (frac === 0n) return Number(whole)
  return Number(whole) + Number(frac) / Number(base)
}

export function normalizeRecipient(recipient) {
  let to = String(recipient ?? '').trim()
  if (!to) throw new Error('Missing recipient')
  if (!to.startsWith('@') && !to.startsWith('DIRECT://')) {
    if (/^alpha[0-9a-z]+$/i.test(to)) to = 'DIRECT://' + to
    else to = '@' + to.replace(/^@/, '')
  }
  return to
}