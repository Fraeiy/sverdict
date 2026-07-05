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
export const fetchHistory = impl.fetchHistory
export const deposit = impl.deposit
export const withdraw = impl.withdraw
export const placeTrade = impl.placeTrade
export const adminCreateMarket = impl.adminCreateMarket
export const adminCloseMarket = impl.adminCloseMarket
export const adminResolveMarket = impl.adminResolveMarket
export const adminWithdrawalQueue = impl.adminWithdrawalQueue
export const adminListPendingWithdrawals = impl.adminListPendingWithdrawals
export const adminFulfillWithdrawal = impl.adminFulfillWithdrawal
export const subscribeToMarkets = impl.subscribeToMarkets
export const fetchSettings = impl.fetchSettings
export const updateSettings = impl.updateSettings
export const fetchNotifications = impl.fetchNotifications
export const markNotificationsRead = impl.markNotificationsRead