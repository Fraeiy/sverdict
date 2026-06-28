import { useCallback } from 'react'
import { getTreasuryAddressFallback } from '../lib/config'
import { resolveCoinId } from '../lib/sphereCoins'

type WalletLike = {
  sendPayment?: (p: { recipient: string; amountHuman: number; coinId?: string; memo?: string }) => Promise<unknown>
  refreshBalance?: () => Promise<void>
}

/** Sphere payments are only used for depositing margin into the portfolio treasury. */
export function useSpherePayment(wallet: WalletLike, treasuryAddress?: string) {
  const treasury = treasuryAddress || getTreasuryAddressFallback() || '@sphere-predict'

  const depositToPortfolio = useCallback(async (amount: number) => {
    if (!wallet.sendPayment) throw new Error('Sphere wallet not ready')
    const n = Number(amount)
    if (!n || n <= 0) throw new Error('Enter a valid deposit amount')

    const result = await wallet.sendPayment({
      recipient: treasury,
      amountHuman: n,
      coinId: resolveCoinId('UCT'),
      memo: 'SPHERE_PREDICT_DEPOSIT',
    })

    await wallet.refreshBalance?.()
    return { result, txReference: extractTxReference(result) }
  }, [wallet, treasury])

  return { depositToPortfolio, treasury }
}

function extractTxReference(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  return (r.txId as string) || (r.tx_id as string) || (r.transactionId as string) || (r.id as string) || undefined
}