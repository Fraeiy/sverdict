/** Canonical payment memos — keep in sync with src/lib/paymentMemos.js */

export const PAYMENT_MEMO_PREFIX = 'SP'
export const PAYMENT_MEMO_VERSION = 'v1'

export const PAYMENT_MEMO_ACTIONS = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  STAKE: 'stake',
  SETTLE: 'settle',
  SEED: 'seed',
} as const

const PARAM_ORDER = ['uid', 'wid', 'mid', 'pid', 'side', 'tid', 'amt'] as const

export function buildPaymentMemo(action: string, params: Record<string, string | undefined> = {}) {
  const parts = [PAYMENT_MEMO_PREFIX, PAYMENT_MEMO_VERSION, action]
  for (const key of PARAM_ORDER) {
    const value = params[key]
    if (value != null && String(value).trim() !== '') {
      parts.push(`${key}=${String(value).trim()}`)
    }
  }
  return parts.join(':')
}

export function buildDepositMemo(userId?: string) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.DEPOSIT, userId ? { uid: userId } : {})
}

export function buildWithdrawMemo(withdrawalId: string) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.WITHDRAW, { wid: withdrawalId })
}

export function buildStakeMemo(opts: { marketId: string; side: string; tradeId?: string; userId?: string }) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.STAKE, {
    uid: opts.userId,
    mid: opts.marketId,
    side: opts.side ? String(opts.side).toUpperCase() : undefined,
    tid: opts.tradeId,
  })
}

export function buildSettleMemo(opts: { marketId: string; positionId: string; userId?: string }) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.SETTLE, {
    uid: opts.userId,
    mid: opts.marketId,
    pid: opts.positionId,
  })
}

export function buildSeedMemo(opts: { marketId: string; userId?: string; amount?: number }) {
  return buildPaymentMemo(PAYMENT_MEMO_ACTIONS.SEED, {
    uid: opts.userId,
    mid: opts.marketId,
    amt: opts.amount != null ? String(opts.amount) : undefined,
  })
}

export function parsePaymentMemo(memo: unknown) {
  if (memo == null) return null
  const trimmed = String(memo).trim()
  if (!trimmed) return null

  if (trimmed === 'SPHERE_PREDICT_DEPOSIT') {
    return { prefix: PAYMENT_MEMO_PREFIX, version: 'legacy', action: PAYMENT_MEMO_ACTIONS.DEPOSIT, params: {} as Record<string, string> }
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

  const params: Record<string, string> = {}
  for (let i = 3; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq > 0) params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1)
  }

  return { prefix: parts[0], version: parts[1], action: parts[2], params }
}

export function assertDepositMemo(memo: unknown, userId: string) {
  const parsed = parsePaymentMemo(memo)
  if (!parsed || parsed.action !== PAYMENT_MEMO_ACTIONS.DEPOSIT) return
  if (parsed.params.uid && parsed.params.uid !== userId) {
    throw new Error('Deposit memo user mismatch')
  }
}