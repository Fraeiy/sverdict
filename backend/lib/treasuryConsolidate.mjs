import { formatWithdrawalAmount } from './withdrawAmount.mjs'
import { summarizeUctInventory } from './treasuryInventory.mjs'

// Off by default — self-transfers show noisy float lines in Sphere wallet.
// Set TREASURY_CONSOLIDATE_MIN_COINS=4 to enable when fragmentation is a problem.
const DEFAULT_MIN_COINS = Number(process.env.TREASURY_CONSOLIDATE_MIN_COINS || 100)
const DEFAULT_MAX_OPS = Number(process.env.TREASURY_CONSOLIDATE_MAX_OPS || 1)

function treasuryRecipient(sphere) {
  const tag = (sphere.identity?.nametag || process.env.TREASURY_NAMETAG || 'sphere-predict')
    .replace(/^@/, '')
  return `@${tag}`
}

function isSendSettled(status) {
  return status === 'confirmed' || status === 'delivered' || status === 'completed'
}

/**
 * Merge the smallest UCT coins back into treasury via self-transfer + receive.
 * Reduces fragmentation before withdrawals and market seeds.
 */
export async function consolidateTreasuryCoins(sphere, {
  minCoins = DEFAULT_MIN_COINS,
  maxOps = DEFAULT_MAX_OPS,
  dryRun = false,
} = {}) {
  const inventory = summarizeUctInventory(sphere)
  if (inventory.tokenCount < minCoins || inventory.tokens.length < 2) {
    return { merged: 0, tokenCountBefore: inventory.tokenCount, tokenCountAfter: inventory.tokenCount }
  }

  const recipient = treasuryRecipient(sphere)
  const small = inventory.tokens.slice(0, -1)
  const ops = Math.min(small.length, maxOps)
  if (dryRun) {
    console.log(
      `[treasury-agent] dry-run consolidate — would merge ${ops} small coin(s) `
      + `(${inventory.tokenCount} total coins, largest ${formatWithdrawalAmount(inventory.largestHuman)} UCT)`,
    )
    return { merged: ops, tokenCountBefore: inventory.tokenCount, tokenCountAfter: inventory.tokenCount, dryRun: true }
  }

  let merged = 0
  for (let i = 0; i < ops; i++) {
    const coin = small[i]
    try {
      console.log(
        `[treasury-agent] consolidating coin ${formatWithdrawalAmount(coin.human)} UCT → ${recipient}`,
      )
      const result = await sphere.payments.send({
        recipient,
        amount: String(coin.raw),
        coinId: 'UCT',
        memo: 'SP:v1:consolidate',
        transferMode: 'conservative',
      })
      if (typeof sphere.payments.waitForPendingOperations === 'function') {
        await sphere.payments.waitForPendingOperations()
      }
      if (!isSendSettled(result?.status)) {
        console.warn(`[treasury-agent] consolidate send status=${result?.status || 'unknown'} — stopping pass`)
        break
      }
      try {
        await sphere.payments.receive()
      } catch { /* best-effort */ }
      merged += 1
    } catch (e) {
      console.warn('[treasury-agent] consolidate failed:', e instanceof Error ? e.message : e)
      break
    }
  }

  const after = summarizeUctInventory(sphere)
  if (merged > 0) {
    console.log(
      `[treasury-agent] consolidated ${merged} coin(s) — inventory ${inventory.tokenCount} → ${after.tokenCount} `
      + `(largest ${formatWithdrawalAmount(after.largestHuman)} UCT)`,
    )
  }
  return {
    merged,
    tokenCountBefore: inventory.tokenCount,
    tokenCountAfter: after.tokenCount,
  }
}