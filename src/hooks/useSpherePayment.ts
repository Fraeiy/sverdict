import { useCallback } from 'react'
import { getTreasuryAddressFallback } from '../lib/config'
import { stakeMemo } from '../lib/format'
import type { Outcome } from '../lib/types'

type WalletLike = {
  sendPayment?: (p: { recipient: string; amountHuman: number; coinId?: string; memo?: string }) => Promise<unknown>
  refreshBalance?: () => Promise<void>
}

export function useSpherePayment(wallet: WalletLike, treasuryAddress?: string) {
  const treasury = treasuryAddress || getTreasuryAddressFallback() || '@sphere-predict'

  const stake = useCallback(async (params: {
    marketId: string
    outcome: Outcome
    amount: number
  }) => {
    if (!wallet.sendPayment) throw new Error('Sphere wallet not ready')
    const amount = Number(params.amount)
    if (!amount || amount <= 0) throw new Error('Enter a valid stake amount')

    const memo = stakeMemo(params.marketId, params.outcome)
    const result = await wallet.sendPayment({
      recipient: treasury,
      amountHuman: amount,
      coinId: 'UCT',
      memo,
    })

    await wallet.refreshBalance?.()
    return { result, memo, txReference: extractTxReference(result) }
  }, [wallet, treasury])

  return { stake, treasury }
}

function extractTxReference(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  return (
    (r.txId as string) ||
    (r.tx_id as string) ||
    (r.transactionId as string) ||
    (r.id as string) ||
    undefined
  )
}