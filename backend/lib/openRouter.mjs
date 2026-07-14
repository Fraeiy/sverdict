const DEFAULT_MODEL = 'openrouter/free'
const FALLBACK_MODELS = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
]
const SITE_URL = process.env.OPENROUTER_SITE_URL || process.env.SITE_URL || 'https://sverdict.vercel.app'

export function openRouterModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL
}

function parseJsonResponse(text) {
  const trimmed = String(text).trim()
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

export async function askOpenRouter(system, user) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('Missing OPENROUTER_API_KEY')

  const models = process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL]
    : FALLBACK_MODELS

  let lastErr = null
  for (const model of models) {
    try {
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
            { role: 'system', content: `${system} Reply with ONLY valid JSON, no markdown.` },
            { role: 'user', content: user },
          ],
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${body.slice(0, 300)}`)
      }

      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text) throw new Error(`Empty response from ${model}`)
      return parseJsonResponse(text)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('All OpenRouter models failed')
}