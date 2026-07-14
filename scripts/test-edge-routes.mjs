import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from '../backend/lib/loadEnv.mjs'

loadProjectEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(url, anon, { auth: { persistSession: false } })

const headers = {
  'X-Wallet-Address': '@sphere-predict',
  'X-Wallet-Nametag': 'sphere-predict',
}

async function call(route, payload = {}) {
  const started = Date.now()
  const { data, error } = await sb.functions.invoke('platform', {
    method: 'POST',
    body: { route, payload },
    headers,
  })
  const ms = Date.now() - started
  if (error) {
    let body = ''
    try { body = await error.context?.text() } catch { /* */ }
    console.log(`FAIL ${route} (${ms}ms) — ${error.message}`)
    if (body) console.log('  body:', body.slice(0, 400))
    return false
  }
  if (data?.error) {
    console.log(`FAIL ${route} (${ms}ms) — ${data.error}`)
    return false
  }
  console.log(`OK   ${route} (${ms}ms)`)
  return true
}

await call('/auth')
await call('/admin/dashboard')
await call('/admin/ai/proposals')
await call('/admin/ai/settlements')