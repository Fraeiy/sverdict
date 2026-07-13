/**
 * AI market agent (dry-run by default) — proposes new markets and settlement hints.
 *
 * Uses OpenRouter (free models available). Advisory only — no auto-execute.
 *
 * Env:
 *   OPENROUTER_API_KEY
 *   OPENROUTER_MODEL (optional, default google/gemma-2-9b-it:free)
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node backend/market-agent.mjs --propose          # suggest new markets
 *   node backend/market-agent.mjs --settle           # review open/closed markets for settlement
 * Settlement suggestions are advisory — use Admin resolve after review.
 */

import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from './lib/loadEnv.mjs'
import { askOpenRouter, openRouterModel } from './lib/openRouter.mjs'

loadProjectEnv()

const PROPOSE = process.argv.includes('--propose')
const SETTLE = process.argv.includes('--settle')

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function proposeMarkets(db) {
  const { data: existing } = await db.from('markets')
    .select('question, category, status')
    .order('created_at', { ascending: false })
    .limit(12)

  const prompt = {
    existing: (existing || []).map(m => ({ question: m.question, category: m.category, status: m.status })),
    want: 3,
  }

  const result = await askOpenRouter(
    'You are a prediction market editor for sphere//predict on Sphere/Unicity. '
    + 'Return JSON: {"markets":[{"question","description","resolutionCriteria","category","daysOpen"}]}. '
    + 'Categories: CRYPTO,SPORTS,POLITICS,TECH,FINANCE,OTHER. daysOpen 3-14. Criteria must be objective.',
    JSON.stringify(prompt),
  )

  console.log('[market-agent] proposed markets:')
  for (const m of result.markets || []) {
    console.log(`  · ${m.question} (${m.category}, ${m.daysOpen}d)`)
    console.log(`    criteria: ${m.resolutionCriteria}`)
  }
  console.log('[market-agent] review proposals in Admin before creating markets')
  return result.markets || []
}

async function reviewSettlements(db) {
  const now = new Date().toISOString()
  const { data: markets } = await db.from('markets')
    .select('id, question, status, deadline, resolution_criteria, yes_pool, no_pool')
    .in('status', ['open', 'closed'])
    .lte('deadline', now)
    .order('deadline', { ascending: true })
    .limit(10)

  if (!markets?.length) {
    console.log('[market-agent] no markets past deadline needing review')
    return []
  }

  const result = await askOpenRouter(
    'You review prediction markets for sphere//predict. '
    + 'Return JSON: {"reviews":[{"marketId","resolution":"YES"|"NO"|"UNCLEAR","confidence":0-1,"reason"}]}. '
    + 'Only YES/NO when criteria clearly met; otherwise UNCLEAR.',
    JSON.stringify({ markets }),
  )

  console.log('[market-agent] settlement review:')
  for (const r of result.reviews || []) {
    const m = markets.find(x => x.id === r.marketId)
    console.log(`  · ${m?.question || r.marketId}`)
    console.log(`    → ${r.resolution} (${Math.round((r.confidence || 0) * 100)}%) — ${r.reason}`)
  }

  console.log('[market-agent] use Admin → Resolve YES/NO after verifying criteria on-chain')

  return result.reviews || []
}

async function main() {
  if (!PROPOSE && !SETTLE) {
    console.log('Usage: node backend/market-agent.mjs --propose | --settle')
    process.exit(1)
  }

  const db = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )

  if (PROPOSE) await proposeMarkets(db)
  if (SETTLE) await reviewSettlements(db)
}

main().catch(e => {
  console.error('[market-agent] fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})