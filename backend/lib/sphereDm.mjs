import { normalizeRecipient } from './constants.mjs'

export function dmRecipientFromUser(user) {
  if (!user) return null
  const tag = String(user.nametag || '').trim().replace(/^@/, '')
  if (tag) return `@${tag}`
  const wallet = String(user.wallet_address || '').trim()
  return wallet || null
}

export function formatMarketWinDm({ payout, question }) {
  const q = String(question || 'market')
  const short = q.length > 80 ? `${q.slice(0, 77)}...` : q
  return `Sverdict: You won! ${Number(payout).toFixed(2)} UCT credited to your portfolio for "${short}". Bet again or withdraw anytime.`
}

export function formatWithdrawalSentDm({ amount, txReference }) {
  const ref = txReference ? ` Ref: ${txReference}` : ''
  return `Sverdict: ${Number(amount).toFixed(2)} UCT sent to your Sphere wallet.${ref}`
}

export async function sendSphereDm(sphere, recipient, content) {
  const to = normalizeRecipient(recipient)
  if (!sphere?.communications?.sendDM) {
    throw new Error('Sphere communications module not available')
  }
  return sphere.communications.sendDM(to, content)
}