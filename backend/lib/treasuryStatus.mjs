import { rawToHuman } from './amount.mjs'
import { formatWithdrawalAmount } from './withdrawAmount.mjs'
import { summarizeUctInventory } from './treasuryInventory.mjs'
import { getUctDecimals, isUctAsset, resolveUctCoinId } from './sphereProviders.mjs'
import { humanFromRawMaybeMistaken, resolveUctDecimals, roundLedgerUct } from './uctAmount.mjs'

export async function sumPendingWithdrawals(db) {
  const { data, error } = await db.from('withdrawals')
    .select('amount')
    .in('status', ['submitted', 'processing'])
  if (error) throw error
  return (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
}

export async function sumPendingSeeds(db) {
  const { data, error } = await db.from('markets')
    .select('seed_liquidity')
    .in('seed_status', ['pending', 'processing'])
  if (error) throw error
  return (data || []).reduce((sum, row) => sum + Number(row.seed_liquidity || 0), 0)
}

async function readOnChainTotals(sphere, decimals) {
  const inventory = summarizeUctInventory(sphere, decimals)
  let totalRaw = inventory.totalRaw
  let totalHuman = inventory.totalHuman
  let largestHuman = inventory.largestHuman

  try {
    const assets = await sphere.payments.getAssets()
    const coinId = resolveUctCoinId()
    const uct = (assets || []).find(a => isUctAsset(a, coinId))
    if (uct) {
      const raw = BigInt(String(uct.totalAmount ?? uct.balance ?? uct.amount ?? 0))
      if (raw > 0n) {
        totalRaw = raw
        totalHuman = rawToHuman(raw, decimals)
      }
    }
  } catch { /* inventory sum is fallback */ }

  totalHuman = humanFromRawMaybeMistaken(totalHuman, totalRaw, decimals)
  largestHuman = humanFromRawMaybeMistaken(largestHuman, inventory.largestRaw, decimals)

  return {
    totalRaw,
    totalHuman: roundLedgerUct(totalHuman),
    largestHuman: roundLedgerUct(largestHuman),
    tokenCount: inventory.tokenCount,
  }
}

export async function publishTreasuryStatus(db, sphere, { updatedBy = 'treasury-worker' } = {}) {
  const [pendingWithdrawals, pendingSeeds] = await Promise.all([
    sumPendingWithdrawals(db),
    sumPendingSeeds(db),
  ])

  const decimals = resolveUctDecimals(getUctDecimals())
  let onChainBalance = 0
  let onChainRaw = '0'
  let uctTokenCount = 0
  let largestCoinHuman = 0

  if (sphere) {
    const totals = await readOnChainTotals(sphere, decimals)
    onChainBalance = totals.totalHuman
    onChainRaw = String(totals.totalRaw)
    uctTokenCount = totals.tokenCount
    largestCoinHuman = totals.largestHuman
  }

  const spendableAfterReserves = roundLedgerUct(Math.max(0, onChainBalance - pendingWithdrawals - pendingSeeds))
  const row = {
    id: 1,
    on_chain_balance: onChainBalance,
    on_chain_raw: onChainRaw,
    uct_token_count: uctTokenCount,
    largest_coin_human: largestCoinHuman,
    pending_withdrawals_total: pendingWithdrawals,
    pending_seeds_total: pendingSeeds,
    spendable_after_reserves: spendableAfterReserves,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  }

  const { error } = await db.from('treasury_status').upsert(row)
  if (error) throw error

  console.log(
    `[treasury-agent] status — on-chain ${formatWithdrawalAmount(onChainBalance)} UCT `
    + `(raw=${onChainRaw}, decimals=${decimals}, ${uctTokenCount} coin(s), `
    + `largest ${formatWithdrawalAmount(largestCoinHuman)}), `
    + `reserved wd=${formatWithdrawalAmount(pendingWithdrawals)} seed=${formatWithdrawalAmount(pendingSeeds)}, `
    + `spendable ${formatWithdrawalAmount(spendableAfterReserves)}`,
  )
  return row
}