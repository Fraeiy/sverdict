/** Keep in sync with src/lib/pnlMeme.ts */

export function pnlMood(pnl, stake, opts = {}) {
  const ratio = stake > 0 ? pnl / stake : 0
  if (opts.resolved && opts.wonOutcome && pnl <= 0) return 'flat'
  if (pnl > 0 && ratio >= 0.5) return 'moon'
  if (pnl > 0) return 'win'
  if (pnl === 0) return 'flat'
  if (pnl < 0 && ratio <= -0.5) return 'rekt'
  return 'loss'
}

export const PNL_MEME = {
  moon: { emoji: '🚀🤑💎', label: 'MOON', caption: 'Absolute heater' },
  win: { emoji: '✅📈😤', label: 'W', caption: 'Green day' },
  flat: { emoji: '😐🫠', label: 'FLAT', caption: 'Broke even' },
  loss: { emoji: '😭📉', label: 'L', caption: 'Took an L' },
  rekt: { emoji: '💀🪦😵', label: 'REKT', caption: 'Down bad' },
}

export function pnlMemeFor(pnl, stake, opts = {}) {
  const mood = pnlMood(pnl, stake, opts)
  return { mood, ...PNL_MEME[mood] }
}