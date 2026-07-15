export const AI_MARKET_CATEGORIES = ['CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER'] as const

/** AI proposals only — manual admin create can use any duration. */
export const AI_MIN_DAYS_OPEN = 7
export const AI_MAX_DAYS_OPEN = 14

export type AiMarketProposal = {
  question: string
  description?: string
  resolutionCriteria: string
  category: string
  daysOpen: number
  /** YYYY-MM-DD — authoritative close date used to derive daysOpen */
  resolveBy: string
}

export type ProposalContext = {
  todayIso: string
  todayLabel: string
  year: number
  minResolveBy: string
  maxResolveBy: string
}

function utcDayStart(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

function utcDayEnd(isoDate: string) {
  return new Date(`${isoDate}T23:59:59.999Z`)
}

function addUtcDays(base: Date, days: number) {
  const d = new Date(base.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function getProposalContext(now = new Date()): ProposalContext {
  const todayIso = toIsoDate(now)
  return {
    todayIso,
    todayLabel: now.toUTCString(),
    year: now.getUTCFullYear(),
    minResolveBy: toIsoDate(addUtcDays(now, AI_MIN_DAYS_OPEN)),
    maxResolveBy: toIsoDate(addUtcDays(now, AI_MAX_DAYS_OPEN)),
  }
}

export function buildMarketProposalSystemPrompt(ctx: ProposalContext) {
  return (
    'You are a prediction market editor for Sverdict on Unicity Sphere testnet. '
    + `TODAY (UTC): ${ctx.todayIso} — ${ctx.todayLabel}. Current year: ${ctx.year}. `
    + 'Every market must be about events that have NOT fully concluded as of today. '
    + 'Do not propose markets whose outcome is already known or whose deadline is in the past. '
    + 'Return JSON only: {"markets":[{"question","description","resolutionCriteria","category","resolveBy"}]}. '
    + 'Fields: '
    + 'question — specific, time-bound, future-looking; '
    + 'description — one sentence context; '
    + 'resolutionCriteria — objective, verifiable rule naming exact data source AND the resolveBy date; '
    + `category — one of ${AI_MARKET_CATEGORIES.join(',')}; `
    + `resolveBy — YYYY-MM-DD when criteria can be checked (inclusive), MUST be between ${ctx.minResolveBy} and ${ctx.maxResolveBy} (7–14 days from today). `
    + 'Align question wording with resolveBy (e.g. "this week" must resolve within 7 days). '
    + 'Pick events resolvable inside that window — product launches, earnings, sports fixtures, policy votes. '
    + 'No duplicate of existing questions.'
  )
}

export function buildMarketProposalUserPayload(existing: Array<{ question: string; category: string; status: string }>, want = 3, ctx: ProposalContext) {
  return JSON.stringify({
    today: ctx.todayIso,
    year: ctx.year,
    want,
    existing,
    rules: {
      minResolveBy: ctx.minResolveBy,
      maxResolveBy: ctx.maxResolveBy,
      daysOpenRange: [AI_MIN_DAYS_OPEN, AI_MAX_DAYS_OPEN],
      categories: AI_MARKET_CATEGORIES,
    },
  })
}

function parseResolveBy(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = utcDayStart(s)
  if (Number.isNaN(d.getTime())) return null
  return s
}

export function daysOpenFromResolveBy(resolveBy: string, now = new Date()) {
  const start = utcDayStart(toIsoDate(now)).getTime()
  const end = utcDayEnd(resolveBy).getTime()
  const days = Math.ceil((end - start) / 86_400_000)
  return Math.max(AI_MIN_DAYS_OPEN, Math.min(AI_MAX_DAYS_OPEN, days))
}

export function normalizeMarketProposal(raw: Record<string, unknown>, ctx: ProposalContext, now = new Date()): AiMarketProposal | null {
  const question = String(raw.question ?? '').trim()
  const resolutionCriteria = String(raw.resolutionCriteria ?? raw.resolution_criteria ?? '').trim()
  if (!question || !resolutionCriteria) return null

  let resolveBy = parseResolveBy(raw.resolveBy ?? raw.resolve_by)
  if (!resolveBy && raw.daysOpen != null) {
    const days = Number(raw.daysOpen)
    if (Number.isFinite(days) && days >= AI_MIN_DAYS_OPEN && days <= AI_MAX_DAYS_OPEN) {
      resolveBy = toIsoDate(addUtcDays(now, Math.round(days)))
    }
  }
  if (!resolveBy) return null

  if (resolveBy < ctx.minResolveBy || resolveBy > ctx.maxResolveBy) return null

  const yearInQuestion = question.match(/\b(20\d{2})\b/g)
  if (yearInQuestion?.some(y => Number(y) < ctx.year)) return null

  let category = String(raw.category ?? 'OTHER').trim().toUpperCase()
  if (!AI_MARKET_CATEGORIES.includes(category as typeof AI_MARKET_CATEGORIES[number])) {
    category = 'OTHER'
  }

  const daysOpen = daysOpenFromResolveBy(resolveBy, now)
  const description = String(raw.description ?? '').trim() || undefined

  return {
    question,
    description,
    resolutionCriteria,
    category,
    daysOpen,
    resolveBy,
  }
}

export function normalizeMarketProposals(rawMarkets: unknown[], ctx: ProposalContext, want = 3): AiMarketProposal[] {
  const out: AiMarketProposal[] = []
  const seen = new Set<string>()

  for (const raw of rawMarkets) {
    if (!raw || typeof raw !== 'object') continue
    const p = normalizeMarketProposal(raw as Record<string, unknown>, ctx)
    if (!p) continue
    const key = p.question.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= want) break
  }

  return out
}

export function deadlineFromResolveBy(resolveBy: string) {
  return utcDayEnd(resolveBy).toISOString()
}