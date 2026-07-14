/**
 * Short share links with Open Graph previews for social apps.
 * Humans: 302 redirect to the SPA market page.
 * Crawlers: static HTML with og:* tags and /s/:code/opengraph-image PNG.
 */

import {
  buildOgHtml,
  buildShareMeta,
  fetchMarketByCode,
  parsePositionShareParams,
  siteOrigin,
} from './lib/shareMeta.mjs'

const CRAWLER_UA = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|embedly|pinterest|googlebot|bingbot/i

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim()
  const origin = siteOrigin(req)
  const position = parsePositionShareParams(req.query)
  const positionParam = req.query.p
  const ua = String(req.headers['user-agent'] || '')
  const isCrawler = CRAWLER_UA.test(ua)

  if (!code) {
    res.status(400).send('Missing share code')
    return
  }

  const market = await fetchMarketByCode(code)
  const meta = buildShareMeta({ origin, code, market, position, positionParam })

  const query = new URLSearchParams(req.query)
  query.delete('code')
  const qs = query.toString()
  const redirect = market
    ? `${origin}/markets/${market.id}${qs ? `?${qs}` : ''}`
    : origin

  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')

  if (!isCrawler) {
    if (!market) {
      res.status(404).send('Market not found')
      return
    }
    res.writeHead(302, { Location: redirect })
    res.end()
    return
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(market ? 200 : 404).send(buildOgHtml({
    ...meta,
    canonical: market ? redirect : origin,
  }))
}