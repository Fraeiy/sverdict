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
export const fetchNotifications = impl.fetchNotifications
export const markNotificationRead = impl.markNotificationRead
export const markAllNotificationsRead = impl.markAllNotificationsRead
export const deposit = impl.deposit
export const withdraw = impl.withdraw
export const placeTrade = impl.placeTrade
export const adminCreateMarket = impl.adminCreateMarket
export const adminCloseMarket = impl.adminCloseMarket
export const adminResolveMarket = impl.adminResolveMarket
export const adminListDeposits = impl.adminListDeposits
export const adminListWithdrawals = impl.adminListWithdrawals
export const subscribeToMarkets = impl.subscribeToMarkets
export const subscribeToNotifications = impl.subscribeToNotifications