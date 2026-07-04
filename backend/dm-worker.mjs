/**
 * Processes outbound Sphere DM queue from @sphere-predict.
 *
 * Required env: TREASURY_MNEMONIC, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node backend/dm-worker.mjs
 *   node backend/dm-worker.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from './lib/loadEnv.mjs'
import { processOutboundDms } from './lib/outboundDm.mjs'
import { initTreasurySphere } from './lib/sphereProviders.mjs'

loadProjectEnv()

const DRY_RUN = process.argv.includes('--dry-run')

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

async function main() {
  const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

  if (DRY_RUN) {
    const n = await processOutboundDms(db, null, { dryRun: true })
    console.log(`[dm-worker] dry-run done — ${n} pending DM(s)`)
    return
  }

  const sphere = await initTreasurySphere({ mnemonic: requireEnv('TREASURY_MNEMONIC') })
  const n = await processOutboundDms(db, sphere)
  console.log(`[dm-worker] done — sent ${n} DM(s)`)
  await sphere.destroy?.()
}

main().catch(e => {
  console.error('[dm-worker] fatal:', e)
  process.exit(1)
})