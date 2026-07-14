/**
 * Short share links with Open Graph previews for social apps.
 * Humans: 302 redirect to the SPA market page.
 * Crawlers: static HTML with og:* tags and /s/:code/opengraph-image PNG.
 */

import {
  buildOgHtml,
  buildShareMeta,
  fetchMarketByCode,
  isLinkPreviewBot,
  parsePositionShareParams,
  siteOrigin,
} from './lib/shareMeta.mjs'

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim()
  const origin = siteOrigin(req)
  const position = parsePositionShareParams(req.query)
  const positionParam = req.query.p
  const ua = String(req.headers['user-agent'] || '')
  const isCrawler = isLinkPreviewBot(ua)

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

  res.setHeader('Vary', 'User-Agent')

  if (!isCrawler) {
    if (!market) {
      res.status(404).send('Market not found')
      return
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.writeHead(302, { Location: redirect })
    res.end()
    return
  }

  res.setHeader('Cache-Control', 'private, no-cache')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(market ? 200 : 404).send(buildOgHtml({
    ...meta,
    canonical: market ? redirect : origin,
  }))
}