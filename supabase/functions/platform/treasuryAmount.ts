const UCT_DECIMALS = 8

export function rawToHumanUct(raw: string | number | bigint, decimals = UCT_DECIMALS) {
  const v = BigInt(String(raw || 0))
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  if (frac === 0n) return Number(whole)
  return Number(whole) + Number(frac) / Number(base)
}

export function roundLedgerUct(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

const RAW_MISTAKE_THRESHOLD = 1_000_000

export function normalizeTreasuryStatusRow(row: Record<string, unknown> | null | undefined) {
  if (!row) return null

  const rawStr = String(row.on_chain_raw || '0')
  let balance = Number(row.on_chain_balance || 0)
  let largest = Number(row.largest_coin_human || 0)
  const pendingWd = Number(row.pending_withdrawals_total || 0)
  const pendingSeeds = Number(row.pending_seeds_total || 0)

  if (balance > RAW_MISTAKE_THRESHOLD) {
    const fromRaw = rawToHumanUct(rawStr)
    if (fromRaw > 0 && fromRaw < balance) balance = fromRaw
    else balance = rawToHumanUct(String(Math.trunc(balance)))
  }
  if (largest > RAW_MISTAKE_THRESHOLD) {
    largest = rawToHumanUct(String(Math.trunc(largest)))
  }

  balance = roundLedgerUct(balance)
  largest = roundLedgerUct(largest)
  const spendable = roundLedgerUct(Math.max(0, balance - pendingWd - pendingSeeds))

  return {
    ...row,
    on_chain_balance: balance,
    largest_coin_human: largest,
    spendable_after_reserves: spendable,
  }
}