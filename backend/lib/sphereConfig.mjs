/**
 * Sphere SDK config for Node treasury worker.
 * testnet2 gateway key is public per sphere-sdk .env.example (not a mainnet secret).
 */
export const TESTNET2_ORACLE_API_KEY = 'sk_ddc3cfcc001e4a28ac3fad7407f99590'

export function sphereNetwork() {
  return process.env.SPHERE_NETWORK || 'testnet'
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