import { DEFAULT_UCT_DECIMALS, rawToHuman } from './amount.mjs'
import { getUctCoinId } from './sphereProviders.mjs'

/**
 * List spendable UCT token sizes in the treasury wallet.
 * Sphere sends one mailbox delivery per source token used — fragmented
 * treasury inventory causes multiple "Received" lines for one withdrawal.
 */
export function listSpendableUctTokens(sphere, coinId = getUctCoinId()) {
  const tokens = sphere.payments.getTokens?.({ coinId }) || []
  const sizes = []
  for (const t of tokens) {
    if (!t || t.status === 'spent' || t.status === 'invalid' || t.status === 'transferring') continue
    const raw = BigInt(String(t.amount || 0))
    if (raw <= 0n) continue
    sizes.push({ id: t.id, raw, human: rawToHuman(raw, DEFAULT_UCT_DECIMALS) })
  }
  sizes.sort((a, b) => (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0))
  return sizes
}

export function summarizeUctInventory(sphere) {
  const tokens = listSpendableUctTokens(sphere)
  const totalRaw = tokens.reduce((sum, t) => sum + t.raw, 0n)
  const largest = tokens.length ? tokens[tokens.length - 1] : null
  return {
    tokenCount: tokens.length,
    totalRaw,
    totalHuman: rawToHuman(totalRaw, DEFAULT_UCT_DECIMALS),
    largestRaw: largest?.raw ?? 0n,
    largestHuman: largest?.human ?? 0,
    tokens,
  }
}

/**
 * Estimate how many Sphere inbox deliveries a send of `amountRaw` will create.
 * One delivery when a single token can be split; otherwise one per direct token.
 */
export function estimateDeliveryCount(tokens, amountRaw) {
  if (amountRaw <= 0n || tokens.length === 0) return 0
  const sorted = [...tokens].sort((a, b) => (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0))
  const total = sorted.reduce((s, t) => s + t.raw, 0n)
  if (total < amountRaw) return -1

  const exact = sorted.find(t => t.raw === amountRaw)
  if (exact) return 1

  let sum = 0n
  let count = 0
  for (const t of sorted) {
    const next = sum + t.raw
    if (next === amountRaw) return count + 1
    if (next < amountRaw) {
      sum = next
      count += 1
      continue
    }
    // Greedy ends with a split from this token → single delivery to recipient
    return count + 1
  }
  return count || 1
}