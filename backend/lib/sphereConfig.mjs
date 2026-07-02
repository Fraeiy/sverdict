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

/** Required so Node worker can pull UCT received by the browser @sphere-predict wallet. */
export function sphereTokenSync() {
  return { ipfs: { enabled: true } }
}

/** On testnet2, mint UCT when spendable balance is 0 (set TREASURY_AUTO_MINT=false to disable). */
export function treasuryAutoMintEnabled() {
  if (process.env.TREASURY_AUTO_MINT === 'false') return false
  const net = sphereNetwork()
  return net === 'testnet' || net === 'testnet2'
}

export function treasuryMintTopupUct() {
  const n = Number(process.env.TREASURY_MINT_TOPUP_UCT || 100)
  return BigInt(Math.max(1, Math.floor(n)))
}