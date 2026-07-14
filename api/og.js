import React from 'react'
import { ImageResponse } from '@vercel/og'
import {
  BRAND,
  LOGO_PATH,
  buildShareMeta,
  fetchMarketByCode,
  fmtUct,
  parsePositionShareParams,
  siteOrigin,
} from './lib/shareMeta.mjs'

const h = React.createElement

const COLORS = {
  bg: '#0a0a0a',
  card: '#111111',
  cardBorder: 'rgba(245, 158, 11, 0.35)',
  text: '#f5f5f5',
  muted: '#a3a3a3',
  gold: '#f59e0b',
  goldBright: '#fbbf24',
  yes: '#fbbf24',
  no: '#f87171',
  panel: '#252525',
}

function truncate(text, max = 120) {
  const s = String(text || '').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function questionFontSize(text) {
  const len = String(text || '').length
  if (len > 110) return 24
  if (len > 80) return 28
  if (len > 50) return 32
  return 36
}

function wrapQuestion(text) {
  const words = String(text || '').trim().split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > 42 && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
    if (lines.length >= 3) break
  }
  if (line && lines.length < 3) lines.push(line)
  if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) {
    lines[2] = truncate(lines[2], 40)
  }
  return lines.length ? lines : [truncate(text, 80) || BRAND]
}

function statCell(label, value, valueColor = COLORS.text) {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
    },
  },
  h('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: COLORS.muted,
      marginBottom: 6,
    },
  }, label),
  h('div', {
    style: { fontSize: 20, fontWeight: 700, color: valueColor },
  }, value),
  )
}

async function fetchLogoDataUrl(origin) {
  try {
    const res = await fetch(`${origin}${LOGO_PATH}`)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function buildOgElement(origin, meta, logoSrc) {
  const logo = logoSrc || `${origin}${LOGO_PATH}`
  const accent = meta.position?.side
    ? (meta.side === 'YES' ? meta.yes : meta.no)
    : meta.yes
  const side = meta.side
  const isYes = side === 'YES'
  const badgeColor = isYes ? COLORS.yes : COLORS.no
  const badgeBg = isYes ? 'rgba(251, 191, 36, 0.18)' : 'rgba(248, 113, 113, 0.18)'
  const badgeBorder = isYes ? 'rgba(251, 191, 36, 0.45)' : 'rgba(248, 113, 113, 0.45)'
  const creator = meta.trader
    ? `@${meta.trader}`
    : (meta.creator ? `@${meta.creator}` : null)
  const questionLines = wrapQuestion(meta.title)
  const qSize = questionFontSize(meta.title)

  const badge = side
    ? h('div', {
      style: {
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: badgeColor,
        background: badgeBg,
        border: `1px solid ${badgeBorder}`,
        borderRadius: 999,
        padding: '6px 14px',
      },
    }, side)
    : h('div', {
      style: {
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: COLORS.goldBright,
        background: 'rgba(245, 158, 11, 0.12)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 999,
        padding: '6px 14px',
      },
    }, `${meta.yes}% YES`)

  const footer = meta.isPosition && meta.position
    ? h('div', {
      style: {
        display: 'flex',
        gap: 16,
        marginTop: 'auto',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        background: COLORS.panel,
        padding: '18px 22px',
      },
    },
    statCell('Side', side || '—', badgeColor),
    statCell('Staked', fmtUct(meta.position.stake)),
    statCell(
      'PnL',
      `${meta.position.pnl >= 0 ? '+' : ''}${fmtUct(meta.position.pnl)}`,
      meta.position.pnl >= 0 ? COLORS.yes : COLORS.no,
    ),
    statCell(
      'Est. value',
      meta.position.value != null ? fmtUct(meta.position.value) : '—',
      COLORS.goldBright,
    ),
    )
    : h('div', {
      style: {
        display: 'flex',
        gap: 20,
        marginTop: 'auto',
        fontSize: 18,
        color: COLORS.muted,
        alignItems: 'center',
      },
    },
    h('span', { style: { color: COLORS.yes, fontWeight: 700 } }, `YES ${meta.yes}%`),
    h('span', null, '·'),
    h('span', { style: { color: COLORS.no, fontWeight: 700 } }, `NO ${meta.no}%`),
    creator
      ? h('span', { style: { marginLeft: 12, color: COLORS.gold } }, creator)
      : null,
    )

  return h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: COLORS.bg,
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    },
  },
  h('div', {
    style: {
      display: 'flex',
      width: 1080,
      height: 540,
      borderRadius: 28,
      border: `2px solid ${COLORS.cardBorder}`,
      background: COLORS.card,
      overflow: 'hidden',
    },
  },
  h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: 360,
      background: COLORS.panel,
      borderRight: `1px solid ${COLORS.cardBorder}`,
    },
  },
  h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      padding: 32,
    },
  },
  h('img', {
    src: logo,
    width: 160,
    height: 160,
    style: { borderRadius: 20, objectFit: 'cover' },
  }),
  ),
  h('div', { style: { height: 10, background: '#1a1a1a', display: 'flex' } },
    h('div', {
      style: {
        height: '100%',
        width: `${Math.min(100, Math.max(0, accent))}%`,
        background: `linear-gradient(90deg, ${COLORS.gold} 0%, ${COLORS.goldBright} 100%)`,
      },
    }),
  ),
  ),
  h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      padding: '36px 44px',
    },
  },
  h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
  },
  h('div', {
    style: {
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: COLORS.gold,
    },
  }, BRAND),
  badge,
  creator && meta.isPosition
    ? h('div', {
      style: { fontSize: 14, color: COLORS.muted },
    }, creator)
    : null,
  ),
  h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      marginBottom: 14,
    },
  }, questionLines.map((line, i) => h('div', {
    key: `q-${i}`,
    style: {
      fontSize: qSize,
      fontWeight: 700,
      lineHeight: 1.2,
      color: COLORS.text,
    },
  }, line))),
  h('div', {
    style: {
      fontSize: 17,
      lineHeight: 1.4,
      color: COLORS.muted,
      marginBottom: 20,
    },
  }, truncate(meta.description, 120)),
  footer,
  ),
  ),
  )
}

function fallbackOgElement(origin, logoSrc) {
  return buildOgElement(origin, {
    title: `${BRAND} prediction markets`,
    description: 'Trade the future on Unicity Sphere — stake UCT on real outcomes.',
    yes: 50,
    no: 50,
    isPosition: false,
  }, logoSrc)
}

async function renderPng(element) {
  const response = new ImageResponse(element, { width: 1200, height: 630 })
  return Buffer.from(await response.arrayBuffer())
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'sverdict.vercel.app'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const origin = siteOrigin({ headers: req.headers })

  try {
    const url = new URL(req.url || '/api/og', `${proto}://${host}`)
    const code = url.searchParams.get('code') || ''
    const position = parsePositionShareParams(url.searchParams)
    const positionParam = url.searchParams.get('p') || undefined
    const market = code ? await fetchMarketByCode(code) : null

    const meta = buildShareMeta({
      origin,
      code,
      market,
      position,
      positionParam,
    })

    const logoSrc = await fetchLogoDataUrl(origin)
    const png = await renderPng(buildOgElement(origin, meta, logoSrc))
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
    res.status(200).send(png)
  } catch {
    try {
      const logoSrc = await fetchLogoDataUrl(origin)
      const png = await renderPng(fallbackOgElement(origin, logoSrc))
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      res.status(200).send(png)
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : 'OG image failed')
    }
  }
}