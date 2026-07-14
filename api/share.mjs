/**
 * Short share links with Open Graph previews for social apps.
 * Humans: 302 redirect to the SPA market page.
 * Crawlers: static HTML with og:* tags (no redirect).
 */

const BRAND = 'Sverdict'
const LOGO_PATH = '/logo.jpg'

const CRAWLER_UA = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|embedly|pinterest|googlebot|bingbot/i

function siteOrigin(req) {
  const envUrl = process.env.SITE_URL || process.env.VITE_SITE_URL
  if (envUrl) return String(envUrl).replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

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
  const base = `${url.replace(/\/$/, '')}/rest/v1/markets`
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const attempts = [
    `${base}?select=id,question,description,yes_pool,no_pool,status,category&limit=20&id=like.${encodeURIComponent(`${prefix}%`)}`,
    `${base}?select=id,question,description,yes_pool,no_pool,status,category&order=created_at.desc&limit=150`,
  ]

  for (const endpoint of attempts) {
    const res = await fetch(endpoint, { headers })
    if (!res.ok) continue
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) continue
    const hit = rows.find(m => String(m.id).replace(/-/g, '').toLowerCase().startsWith(prefix))
    if (hit) return hit
  }
  return null
}

function buildOgHtml({ title, description, shareUrl, image, canonical }) {
  return `<!DOCTYPE html>
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
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="canonical" href="${canonical}" />
</head>
<body><p>${escapeHtml(title)}</p></body>
</html>`
}

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim()
  const origin = siteOrigin(req)

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
  const image = `${origin}${LOGO_PATH}`
  const query = new URLSearchParams(req.query)
  query.delete('code')
  const qs = query.toString()
  const redirect = `${origin}/markets/${market.id}${qs ? `?${qs}` : ''}`
  const ua = String(req.headers['user-agent'] || '')
  const isCrawler = CRAWLER_UA.test(ua)

  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')

  if (!isCrawler) {
    res.writeHead(302, { Location: redirect })
    res.end()
    return
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(buildOgHtml({
    title,
    description,
    shareUrl,
    image,
    canonical: redirect,
  }))
}