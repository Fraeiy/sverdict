import { DEFAULT_UCT_DECIMALS, humanToRawBigInt } from './amount.mjs'

/** User-facing + ledger precision for withdrawals (matches fmtUct). */
export const WITHDRAWAL_DISPLAY_DECIMALS = 2

/**
 * Normalize a withdrawal amount to 2 decimal places (no float dust).
 * Returns null when invalid.
 */
export function normalizeWithdrawalAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/** Ledger human amount → raw smallest units (bigint, no float drift). */
export function withdrawalAmountToRaw(amount, decimals = DEFAULT_UCT_DECIMALS) {
  const human = normalizeWithdrawalAmount(amount)
  if (human == null) return 0n
  return humanToRawBigInt(human, decimals)
}

export function formatWithdrawalAmount(amount) {
  const human = normalizeWithdrawalAmount(amount)
  if (human == null) return '0.00'
  return human.toFixed(WITHDRAWAL_DISPLAY_DECIMALS)
}