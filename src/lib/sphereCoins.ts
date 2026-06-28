/** UCT on Unicity testnet2 — from unicity-ids.testnet2.json */
export const UCT_COIN_ID_TESTNET2 =
  import.meta.env.VITE_UCT_COIN_ID ||
  'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0'

/** Resolve a symbol or hex coin id to the canonical lowercase hex id. */
export function resolveCoinId(coinId?: string): string {
  const raw = (coinId || 'UCT').trim()
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase()
  if (raw.toUpperCase() === 'UCT') return UCT_COIN_ID_TESTNET2
  return raw
}

export function isUctAsset(asset: { coinId?: string; symbol?: string }) {
  const id = asset.coinId?.toLowerCase()
  return (
    asset.symbol === 'UCT' ||
    id === UCT_COIN_ID_TESTNET2 ||
    id === 'uct'
  )
}