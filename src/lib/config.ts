export type BackendMode = 'supabase' | 'rest'

export function getBackendMode(): BackendMode {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (url && key && !String(url).includes('YOUR_PROJECT')) return 'supabase'
  return 'rest'
}

export function getTreasuryAddressFallback(): string {
  return import.meta.env.VITE_TREASURY_ADDRESS || ''
}

export function getSiteUrl(): string {
  const env = import.meta.env.VITE_SITE_URL
  if (env) return String(env).replace(/\/$/, '')
  return 'https://sverdict.vercel.app'
}

export function isProductionDeploy(): boolean {
  return import.meta.env.PROD && !import.meta.env.DEV
}

export function isMisconfiguredProduction(): boolean {
  return isProductionDeploy() && getBackendMode() !== 'supabase'
}