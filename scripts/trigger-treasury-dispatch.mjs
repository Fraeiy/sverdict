#!/usr/bin/env node
/**
 * Trigger Treasury Agent via GitHub repository_dispatch (reliable ~5 min cadence).
 *
 * Use with cron-job.org, Windows Task Scheduler, or a VPS cron:
 *   GITHUB_PAT=ghp_... npm run treasury:trigger
 *
 * PAT needs `repo` scope (classic) or Actions write (fine-grained).
 */

const REPO = process.env.GITHUB_REPO || 'Fraeiy/sphere-predict'
const TOKEN = process.env.GITHUB_PAT || process.env.GH_TOKEN || ''
const EVENT = process.env.GITHUB_DISPATCH_EVENT || 'treasury-tick'

if (!TOKEN) {
  console.error('Missing GITHUB_PAT (or GH_TOKEN) — create a classic PAT with repo scope')
  process.exit(1)
}

const url = `https://api.github.com/repos/${REPO}/dispatches`
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ event_type: EVENT }),
})

if (res.status === 204) {
  console.log(`[treasury-trigger] dispatched ${EVENT} → ${REPO} at ${new Date().toISOString()}`)
  process.exit(0)
}

const body = await res.text()
console.error(`[treasury-trigger] failed HTTP ${res.status}: ${body}`)
process.exit(1)