import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** openrouter/free auto-picks an available free model (old gemma-2-9b IDs are 404). */
const FALLBACK_MODELS = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
]
const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? FALLBACK_MODELS[0]
const SITE_URL = Deno.env.get('OPENROUTER_SITE_URL') ?? 'https://sphere-predict.vercel.app'

export type AiMarketProposal = {
  question: string
  description?: string
  resolutionCriteria: string
  category: string
  daysOpen: number
}

export type AiSettlementReview = {
  marketId: string
  question: string
  resolution: 'YES' | 'NO' | 'UNCLEAR'
  confidence: number
  reason: string
}

function parseJsonResponse(text: string) {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) return JSON.parse(fenced[1].trim())
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
    throw new Error('Model did not return valid JSON')
  }
}

async function askOpenRouterOnce(model: string, key: string, system: string, user: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': SITE_URL,
      'X-Title': 'Sverdict',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system + ' Reply with ONLY valid JSON, no markdown.' },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error(`Empty AI response from ${model}`)
  return parseJsonResponse(text)
}

async function askOpenRouter(system: string, user: string) {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) {
    throw new Error(
      'AI suggestions not configured — add OPENROUTER_API_KEY to Supabase Edge Function secrets '
      + '(Dashboard → Edge Functions → platform → Secrets)',
    )
  }

  const models = Deno.env.get('OPENROUTER_MODEL')
    ? [Deno.env.get('OPENROUTER_MODEL')!]
    : FALLBACK_MODELS

  let lastErr: Error | null = null
  for (const model of models) {
    try {
      return await askOpenRouterOnce(model, key, system, user)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('All OpenRouter models failed')
}

export async function fetchAiMarketProposals(db: SupabaseClient) {
  const { data: existing } = await db.from('markets')
    .select('question, category, status')
    .order('created_at', { ascending: false })
    .limit(12)

  const result = await askOpenRouter(
    'You are a prediction market editor for Sverdict on Sphere/Unicity. '
    + 'Return JSON: {"markets":[{"question","description","resolutionCriteria","category","daysOpen"}]}. '
    + 'Categories: CRYPTO,SPORTS,POLITICS,TECH,FINANCE,OTHER. daysOpen 3-14. Criteria must be objective and verifiable.',
    JSON.stringify({
      existing: (existing || []).map(m => ({ question: m.question, category: m.category, status: m.status })),
      want: 3,
    }),
  )

  const markets = (result.markets || []) as AiMarketProposal[]
  return {
    proposals: markets.filter(m => m.question && m.resolutionCriteria),
    advisory: true,
    model: MODEL,
    provider: 'openrouter',
  }
}

export async function fetchAiSettlementReviews(db: SupabaseClient) {
  const now = new Date().toISOString()
  const { data: markets } = await db.from('markets')
    .select('id, question, status, deadline, resolution_criteria, yes_pool, no_pool')
    .in('status', ['open', 'closed'])
    .lte('deadline', now)
    .order('deadline', { ascending: true })
    .limit(10)

  if (!markets?.length) {
    return { reviews: [] as AiSettlementReview[], advisory: true, model: MODEL, provider: 'openrouter' }
  }

  const result = await askOpenRouter(
    'You review prediction markets for Sverdict. '
    + 'Return JSON: {"reviews":[{"marketId","resolution":"YES"|"NO"|"UNCLEAR","confidence":0-1,"reason"}]}. '
    + 'marketId must match input ids. Only YES/NO when criteria clearly met; otherwise UNCLEAR.',
    JSON.stringify({ markets }),
  )

  const byId = new Map(markets.map(m => [m.id, m.question]))
  const reviews = ((result.reviews || []) as Array<{
    marketId: string
    resolution: string
    confidence: number
    reason: string
  }>).map(r => ({
    marketId: r.marketId,
    question: byId.get(r.marketId) || 'Unknown market',
    resolution: (['YES', 'NO', 'UNCLEAR'].includes(r.resolution) ? r.resolution : 'UNCLEAR') as AiSettlementReview['resolution'],
    confidence: Number(r.confidence) || 0,
    reason: String(r.reason || ''),
  }))

  return { reviews, advisory: true, model: MODEL, provider: 'openrouter' }
}