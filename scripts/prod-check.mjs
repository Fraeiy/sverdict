#!/usr/bin/env node
/**
 * Validates production environment before Vercel deploy.
 * Usage: npm run prod:check
 * Loads .env.production.local, .env.production, .env if present.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(file) {
  const p = path.join(root, file)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

for (const f of ['.env.production.local', '.env.production', '.env']) loadEnvFile(f)

const required = [
  ['VITE_WALLET_URL', 'Sphere wallet host'],
  ['VITE_SUPABASE_URL', 'Supabase project URL'],
  ['VITE_SUPABASE_ANON_KEY', 'Supabase anon key'],
  ['VITE_TREASURY_ADDRESS', 'Treasury address for deposits'],
]

const optional = [
  ['VITE_MARKET_API_URL', 'REST API (dev only — should be empty in prod)'],
]

let ok = true

console.log('\n🔍 Production readiness check\n')

for (const [key, desc] of required) {
  const val = process.env[key]
  if (!val || val.includes('YOUR_PROJECT') || val === 'your-anon-key') {
    console.log(`❌ ${key} — missing (${desc})`)
    ok = false
  } else {
    console.log(`✅ ${key}`)
  }
}

for (const [key] of optional) {
  const val = process.env[key]
  if (val) {
    console.log(`⚠️  ${key} is set — remove for production (use Supabase instead)`)
    ok = false
  }
}

if (process.env.VITE_SUPABASE_URL && process.env.VITE_MARKET_API_URL) {
  console.log('⚠️  Both Supabase and REST API set — Supabase wins, but clean up VITE_MARKET_API_URL')
}

console.log('')
if (ok) {
  console.log('✅ Ready for Vercel production deploy\n')
  process.exit(0)
} else {
  console.log('❌ Fix the items above, then redeploy.\n')
  console.log('See PRODUCTION.md for step-by-step setup.\n')
  process.exit(1)
}