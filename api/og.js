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

export const config = {
  runtime: 'edge',
}

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

function Stat({ label, value, valueColor = COLORS.text }) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
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
    h('div', { style: { fontSize: 20, fontWeight: 700, color: valueColor } }, value),
  )
}

function OgCard({ origin, meta }) {
  const logo = `${origin}${LOGO_PATH}`
  const accent = meta.position?.side
    ? (meta.side === 'YES' ? meta.yes : meta.no)
    : meta.yes
  const side = meta.side
  const isYes = side === 'YES'
  const badgeColor = isYes ? COLORS.yes : COLORS.no
  const badgeBg = isYes ? 'rgba(251, 191, 36, 0.18)' : 'rgba(248, 113, 113, 0.18)'
  const badgeBorder = isYes ? 'rgba(251, 191, 36, 0.45)' : 'rgba(248, 113, 113, 0.45)'

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
    h(Stat, { label: 'Side', value: side, valueColor: badgeColor }),
    h(Stat, { label: 'Staked', value: fmtUct(meta.position.stake) }),
    h(Stat, {
      label: 'PnL',
      value: `${meta.position.pnl >= 0 ? '+' : ''}${fmtUct(meta.position.pnl)}`,
      valueColor: meta.position.pnl >= 0 ? COLORS.yes : COLORS.no,
    }),
    )
    : h('div', {
      style: {
        display: 'flex',
        gap: 20,
        marginTop: 'auto',
        fontSize: 16,
        color: COLORS.muted,
      },
    },
    h('span', null, h('span', { style: { color: COLORS.yes, fontWeight: 700 } }, `YES ${meta.yes}%`)),
    h('span', null, '·'),
    h('span', null, h('span', { style: { color: COLORS.no, fontWeight: 700 } }, `NO ${meta.no}%`)),
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
      boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
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
  h('div', { style: { height: 10, background: '#1a1a1a' } },
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
      padding: '40px 44px',
    },
  },
  h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 } },
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
  ),
  h('div', {
    style: {
      fontSize: 34,
      fontWeight: 700,
      lineHeight: 1.25,
      color: COLORS.text,
      marginBottom: 16,
      maxHeight: 130,
      overflow: 'hidden',
    },
  }, truncate(meta.title, 110)),
  h('div', {
    style: {
      fontSize: 18,
      lineHeight: 1.45,
      color: COLORS.muted,
      marginBottom: 28,
      maxHeight: 84,
      overflow: 'hidden',
    },
  }, truncate(meta.description, 140)),
  footer,
  ),
  ),
  )
}

export default async function handler(req) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const origin = siteOrigin({ headers: Object.fromEntries(req.headers) })
  const position = parsePositionShareParams(url.searchParams)
  const market = code ? await fetchMarketByCode(code) : null
  const positionParam = url.searchParams.get('p') || undefined

  const meta = buildShareMeta({
    origin,
    code,
    market,
    position,
    positionParam,
  })

  return new ImageResponse(
    h(OgCard, { origin, meta }),
    { width: 1200, height: 630 },
  )
}