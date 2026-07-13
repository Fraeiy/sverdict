import { readFileSync } from 'fs'
import { loadProjectEnv } from '../backend/lib/loadEnv.mjs'

loadProjectEnv()

const key = process.env.OPENROUTER_API_KEY
if (!key) {
  console.error('No OPENROUTER_API_KEY')
  process.exit(1)
}

const models = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
]

for (const model of models) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sphere-predict.vercel.app',
      'X-Title': 'sphere//predict',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: 'Return JSON only: {"markets":[{"question":"BTC above 100k?","description":"test","resolutionCriteria":"YES if BTC above 100k","category":"CRYPTO","daysOpen":7}]}',
      }],
    }),
  })
  const text = await res.text()
  console.log(`\n${model} → ${res.status}`)
  console.log(text.slice(0, 400))
}