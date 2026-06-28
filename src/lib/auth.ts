import type { WalletIdentity } from './types'
import type { AuthHeaders } from './apiRest'

/** Stable auth headers — always send nametag AND direct address so backend matches one user. */
export function authFromIdentity(identity: WalletIdentity | null): AuthHeaders | null {
  if (!identity?.directAddress && !identity?.nametag) return null
  return {
    walletAddress: identity.nametag || identity.directAddress || '',
    nametag: identity.nametag,
    directAddress: identity.directAddress,
    publicKey: identity.publicKey,
  }
}