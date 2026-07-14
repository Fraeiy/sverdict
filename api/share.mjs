/**
 * Short share links with Open Graph previews for social apps + redirect for browsers.
 * /s/:code → rewrite → /api/share?code=:code
 */

const BRAND = 'Sverdict'
const LOGO = '/logo.jpg'

function yesPct(market) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  if (!total) return 50
  return Math.round((Number(market.yes_pool || 0) / total) * 100)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function fetchMarketByCode(code) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null

  const prefix = String(code).replace(/-/g, '').slice(0, 8).toLowerCase()
  const rest = `${url.replace(/\/$/, '')}/rest/v1/markets?select=id,question,description,yes_pool,no_pool,status,category&limit=5`
  const res = await fetch(`${rest}&id=ilike.${prefix}*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  if (!Array.isArray(rows) || !rows.length) return null
  if (rows.length === 1) return rows[0]
  return rows.find(m => m.id.replace(/-/g, '').toLowerCase().startsWith(prefix)) || rows[0]
}

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim()
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const origin = `${proto}://${host}`

  if (!code) {
    res.status(400).send('Missing share code')
    return
  }

  const market = await fetchMarketByCode(code)
  if (!market) {
    res.status(404).send('Market not found')
    return
  }

  const yes = yesPct(market)
  const no = 100 - yes
  const title = market.question
  const description = `${yes}% YES · ${no}% NO — ${BRAND} prediction market on Sphere`
  const shareUrl = `${origin}/s/${code}`
  const image = `${origin}${LOGO}`
  const appPath = `/markets/${market.id}`
  const query = new URLSearchParams(req.query)
  query.delete('code')
  const qs = query.toString()
  const redirect = `${origin}${appPath}${qs ? `?${qs}` : ''}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${BRAND}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${BRAND}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />
  <meta http-equiv="refresh" content="0;url=${redirect}" />
  <link rel="canonical" href="${redirect}" />
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:#111; color:#d1d5db; font-family:system-ui,sans-serif; }
    a { color:#f59e0b; }
  </style>
</head>
<body>
  <p>Opening market on <a href="${redirect}">${BRAND}</a>…</p>
  <script>location.replace(${JSON.stringify(redirect)})</script>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).send(html)
}