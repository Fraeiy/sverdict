import { getBackendMode } from './config'
import * as rest from './apiRest'
import * as supa from './apiSupabase'

export type { AuthHeaders } from './apiRest'

const impl = getBackendMode() === 'supabase' ? supa : rest

export const getApiMode = getBackendMode

export const fetchTreasury = impl.fetchTreasury
export const authenticate = impl.authenticate
export const fetchMarkets = impl.fetchMarkets
export const fetchMarket = impl.fetchMarket
export const fetchPortfolio = impl.fetchPortfolio
export const fetchClaims = impl.fetchClaims
export const claimReward = impl.claimReward
export const placeStake = impl.placeStake
export const adminCreateMarket = impl.adminCreateMarket
export const adminCloseMarket = impl.adminCloseMarket
export const adminResolveMarket = impl.adminResolveMarket
export const subscribeToMarkets = impl.subscribeToMarkets