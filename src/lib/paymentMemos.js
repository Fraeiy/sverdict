/**
 * Canonical on-chain / ledger payment memos for sphere//predict.
 *
 * Format: SP:v1:<action>[:key=value...]
 * Keys (when present): uid, wid, mid, pid, side, tid
 */

export const PAYMENT_MEMO_PREFIX = 'SP'
export const PAYMENT_MEMO_VERSION = 'v1'

export const PAYMENT_MEMO_ACTIONS = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  STAKE: 'stake',
  SETTLE: 'settle',
  SEED: 'seed',
}

const PARAM_ORDER = ['uid', 'wid', 'mid', 'pid', 'side', 'tid', 'amt']

export function buildPaymentMemo(action, params = {}) {
  const parts = [PAYMENT_MEMO_PREFIX, PAYMENT_MEMO_VERSION, action]
  for (const key of PARAM_ORDER) {
    const value = params[key]
    if (value != null && String(value).trim() !== '') {
      parts.push(`${key}=${String(value).trim()}`)
    }
  }
  return parts.join(':')
}

export function buildDepositMemo(userId) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.DEPOSIT, userId ? { uid: userId } : {})
}

export function buildWithdrawMemo(withdrawalId) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.WITHDRAW, { wid: withdrawalId })
}

export function buildStakeMemo({ marketId, side, tradeId, userId }) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.STAKE, {
    uid: userId,
    mid: marketId,
    side: side ? String(side).toUpperCase() : undefined,
    tid: tradeId,
  })
}

export function buildSettleMemo({ marketId, positionId, userId }) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.SETTLE, {
    uid: userId,
    mid: marketId,
    pid: positionId,
  })
}

export function buildSeedMemo({ marketId, userId, amount }) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.SEED, {
    uid: userId,
    mid: marketId,
    amt: amount != null ? String(amount) : undefined,
  })
}

/** Parse SP:v1 memos and legacy SPHERE_PREDICT_* strings. */
export function parsePaymentMemo(memo) {
  if (memo == null) return null
  const trimmed = String(memo).trim()
  if (!trimmed) return null

  if (trimmed === 'SPHERE_PREDICT_DEPOSIT') {
    return { prefix: PAYMENT_MEMO_PREFIX, version: 'legacy', action: PAYMENT_MEMO_ACTIONS.DEPOSIT, params: {} }
  }

  const legacyWithdraw = trimmed.match(/^SPHERE_PREDICT_WITHDRAW:(.+)$/)
  if (legacyWithdraw) {
    return {
      prefix: PAYMENT_MEMO_PREFIX,
      version: 'legacy',
      action: PAYMENT_MEMO_ACTIONS.WITHDRAW,
      params: { wid: legacyWithdraw[1] },
    }
  }

  const parts = trimmed.split(':')
  if (parts.length < 3 || parts[0] !== PAYMENT_MEMO_PREFIX) return null

  const params = {}
  for (let i = 3; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq > 0) params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1)
  }

  return { prefix: parts[0], version: parts[1], action: parts[2], params }
}

export function isPaymentMemo(memo, action) {
  const parsed = parsePaymentMemo(memo)
  return parsed?.action === action
}