export type UserPreferences = {
  defaultStake: number
  confirmBeforeTrade: boolean
  dmOnWin: boolean
  dmOnWithdrawal: boolean
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultStake: 25,
  confirmBeforeTrade: true,
  dmOnWin: true,
  dmOnWithdrawal: true,
}

const STORAGE_KEY = 'sphere-predict-preferences'

export function normalizePreferences(raw: unknown): UserPreferences {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserPreferences>
  const stake = Number(p.defaultStake)
  return {
    defaultStake: stake > 0 && stake <= 10_000 ? stake : DEFAULT_USER_PREFERENCES.defaultStake,
    confirmBeforeTrade: p.confirmBeforeTrade !== false,
    dmOnWin: p.dmOnWin !== false,
    dmOnWithdrawal: p.dmOnWithdrawal !== false,
  }
}

export function loadCachedPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_USER_PREFERENCES }
    return normalizePreferences(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_USER_PREFERENCES }
  }
}

export function cachePreferences(prefs: UserPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* ignore */ }
}

export function clearConnectSession() {
  try {
    sessionStorage.removeItem('sphere-connect-popup-session')
  } catch { /* ignore */ }
}