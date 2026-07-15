/** Fun PnL vibes for share cards + OG images (emoji — no external meme assets). */

export type PnlMood = 'moon' | 'win' | 'flat' | 'loss' | 'rekt'

export function pnlMood(pnl: number, stake: number, opts?: { resolved?: boolean; wonOutcome?: boolean }) {
  const ratio = stake > 0 ? pnl / stake : 0
  if (opts?.resolved && opts.wonOutcome && pnl <= 0) return 'flat' as PnlMood
  if (pnl > 0 && ratio >= 0.5) return 'moon'
  if (pnl > 0) return 'win'
  if (pnl === 0) return 'flat'
  if (pnl < 0 && ratio <= -0.5) return 'rekt'
  return 'loss'
}

export const PNL_MEME: Record<PnlMood, { emoji: string; label: string; caption: string }> = {
  moon: { emoji: '🚀🤑💎', label: 'MOON', caption: 'Absolute heater' },
  win: { emoji: '✅📈😤', label: 'W', caption: 'Green day' },
  flat: { emoji: '😐🫠', label: 'FLAT', caption: 'Broke even' },
  loss: { emoji: '😭📉', label: 'L', caption: 'Took an L' },
  rekt: { emoji: '💀🪦😵', label: 'REKT', caption: 'Down bad' },
}

export function pnlMemeFor(pnl: number, stake: number, opts?: { resolved?: boolean; wonOutcome?: boolean }) {
  const mood = pnlMood(pnl, stake, opts)
  return { mood, ...PNL_MEME[mood] }
}