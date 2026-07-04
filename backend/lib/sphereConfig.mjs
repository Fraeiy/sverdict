/**
 * Sphere SDK config for Node treasury worker.
 * testnet2 gateway key is public per sphere-sdk .env.example (not a mainnet secret).
 */
export const TESTNET2_ORACLE_API_KEY = 'sk_ddc3cfcc001e4a28ac3fad7407f99590'

export function sphereNetwork() {
  const raw = (process.env.SPHERE_NETWORK || 'testnet').trim()
  return raw || 'testnet'
}

export function sphereOracleApiKey() {
  return process.env.SPHERE_ORACLE_API_KEY || TESTNET2_ORACLE_API_KEY
}

export function sphereDataDirs() {
  return {
    dataDir: process.env.TREASURY_DATA_DIR || './.treasury-data',
    tokensDir: process.env.TREASURY_TOKENS_DIR || './.treasury-tokens',
  }
}

/** Optional IPFS backup/recovery — not the v2 payment rail (wallet-api mailbox is). */
export function sphereTokenSync() {
  if (process.env.TREASURY_IPFS_SYNC === 'false') return undefined
  return { ipfs: { enabled: true } }
}

/** Canonical testnet2 wallet-api host per sphere-sdk docs. */
export function sphereWalletApiBaseUrl() {
  return process.env.SPHERE_WALLET_API_URL || 'https://wallet-api.unicity.network'
}

/** v2 wallet-api network id — must match gateway (testnet aliases testnet2). */
export function sphereWalletApiNetwork() {
  const raw = (process.env.SPHERE_WALLET_API_NETWORK || 'testnet2').trim()
  return raw || 'testnet2'
}

