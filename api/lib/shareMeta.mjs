export const BRAND = 'Sverdict'
export const LOGO_PATH = '/logo.jpg'
export const DEFAULT_SITE = 'https://sverdict.vercel.app'

export function siteOrigin(req) {
  const envUrl = process.env.SITE_URL || process.env.VITE_SITE_URL
  if (envUrl) return String(envUrl).replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (host && !host.includes('localhost')) {
    const proto = req.headers['x-forwarded-proto'] || 'https'
    return `${proto}://${host}`
  }
  return DEFAULT_SITE
}

export function yesPct(market) {
  const total = Number(market.yes_pool || 0) + Number(market.no_pool || 0)
  if (!total) return 50
  return Math.round((Number(market.yes_pool || 0) / total) * 100)
}

export function fmtUct(n) {
  const value = Number(n)
  if (!Number.isFinite(value)) return '0 UCT'
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} UCT`
}

/** Compact query: p=YES,25,5,fraey — mirrors src/lib/share.ts */
export function parsePositionShareParams(query) {
  const compact = typeof query?.get === 'function' ? query.get('p') : query?.p
  if (!compact) return null

  const raw = Array.isArray(compact) ? compact[0] : compact
  const [side, stakeRaw, pnlRaw, valueRaw, by] = String(raw).split(',')
  const stake = Number(stakeRaw)
  const pnl = Number(pnlRaw)
  if (!side || !Number.isFinite(stake) || !Number.isFinite(pnl)) return null

  const value = Number(valueRaw)
  return {
    side,
    stake,
    pnl,
    value: Number.isFinite(value) ? value : undefined,
    by: by || undefined,
  }
}

export async function fetchMarketByCode(code) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null

  const prefix = String(code).replace(/-/g, '').slice(0, 8).toLowerCase()
  const base = `${url.replace(/\/$/, '')}/rest/v1/markets`
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const select = 'id,question,description,yes_pool,no_pool,status,category,created_by'
  const attempts = [
    `${base}?select=${select}&limit=20&id=like.${encodeURIComponent(`${prefix}%`)}`,
    `${base}?select=${select}&order=created_at.desc&limit=150`,
  ]

  let market = null
  for (const endpoint of attempts) {
    const res = await fetch(endpoint, { headers })
    if (!res.ok) continue
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) continue
    const hit = rows.find(m => String(m.id).replace(/-/g, '').toLowerCase().startsWith(prefix))
    if (hit) {
      market = hit
      break
    }
  }
  if (!market) return null

  if (market.created_by) {
    try {
      const userRes = await fetch(
        `${url.replace(/\/$/, '')}/rest/v1/users?id=eq.${market.created_by}&select=nametag&limit=1`,
        { headers },
      )
      if (userRes.ok) {
        const users = await userRes.json()
        if (users?.[0]?.nametag) market.creator_nametag = users[0].nametag
      }
    } catch { /* optional */ }
  }

  return market
}

export function buildOgImageUrl(origin, code, positionParam) {
  const safeCode = encodeURIComponent(String(code || ''))
  const base = `${origin}/s/${safeCode}/opengraph-image`
  const p = positionParam != null
    ? (Array.isArray(positionParam) ? positionParam[0] : String(positionParam))
    : ''
  if (!p) return base
  return `${base}?p=${encodeURIComponent(p)}`
}

export function buildShareMeta({ origin, code, market, position, positionParam }) {
  const yes = market ? yesPct(market) : 50
  const no = 100 - yes
  const shareUrl = code ? `${origin}/s/${code}` : origin
  const image = buildOgImageUrl(origin, code, positionParam)

  if (!market) {
    return {
      title: `${BRAND} prediction markets`,
      description: 'Trade the future on Unicity Sphere — stake UCT on real outcomes.',
      shareUrl,
      image,
      canonical: origin,
      yes,
      no,
      isPosition: false,
      isFallback: true,
    }
  }

  const title = market.question
  const side = position?.side?.toUpperCase()
  const trader = position?.by?.replace(/^@/, '')
  const creator = market.creator_nametag?.replace(/^@/, '') || undefined

  let description
  if (position) {
    const pnlLabel = `${position.pnl >= 0 ? '+' : ''}${fmtUct(position.pnl)}`
    description = trader
      ? `@${trader} · ${side} · Staked ${fmtUct(position.stake)} · PnL ${pnlLabel}`
      : `${side} · Staked ${fmtUct(position.stake)} · PnL ${pnlLabel} — ${BRAND}`
  } else {
    description = `${yes}% YES · ${no}% NO — ${BRAND} prediction market on Sphere`
  }

  const query = positionParam ? `?p=${encodeURIComponent(Array.isArray(positionParam) ? positionParam[0] : positionParam)}` : ''
  const canonical = `${origin}/markets/${market.id}${query}`

  return {
    title,
    description,
    shareUrl,
    image,
    canonical,
    yes,
    no,
    market,
    position,
    side,
    trader,
    creator,
    isPosition: !!position,
    isFallback: false,
  }
}

/** True only for link-preview scrapers — not in-app browsers (WhatsApp, Telegram, etc.). */
export function isLinkPreviewBot(userAgent) {
  const ua = String(userAgent || '')
  if (!ua) return false

  const lower = ua.toLowerCase()

  // Real interactive browsers (including WhatsApp/Telegram/Discord in-app WebViews)
  if (/mozilla\/5\.0/i.test(ua) && /(chrome|safari|firefox|edg|opera|samsungbrowser|crios|fxios)/i.test(ua)) {
    if (!/(googlebot|bingbot|yandexbot|duckduckbot)/i.test(lower)) return false
  }

  // WhatsApp previews use facebookexternalhit — not the bare "whatsapp" substring in app UAs
  return /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|embedly|pinterest|googlebot|bingbot/i.test(lower)
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildOgHtml(meta) {
  const { title, description, shareUrl, image, canonical } = meta
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
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
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