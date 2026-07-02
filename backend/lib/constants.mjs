/** UCT on Unicity testnet2 */
export const UCT_COIN_ID =
  process.env.UCT_COIN_ID ||
  'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0'

const DECIMALS = 18n

export function toRawString(human) {
  const n = BigInt(Math.floor(Number(human)))
  return String(n * 10n ** DECIMALS)
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