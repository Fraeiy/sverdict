/**
 * External cron (cron-job.org) → GitHub repository_dispatch → Treasury Agent.
 * Vercel Hobby cannot run 5-min Vercel Cron — use cron-job.org instead.
 *
 * Vercel env (server-only, never VITE_*):
 *   GITHUB_PAT   — classic PAT with repo scope (or fine-grained Actions write)
 *   CRON_SECRET  — random string; Vercel sends Authorization: Bearer <CRON_SECRET>
 *   GITHUB_REPO  — optional, default Fraeiy/sphere-predict
 */

const REPO = process.env.GITHUB_REPO || 'Fraeiy/sphere-predict'
const EVENT = process.env.GITHUB_DISPATCH_EVENT || 'treasury-tick'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = String(req.headers.authorization || '')
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }
  }

  const token = String(process.env.GITHUB_PAT || process.env.GH_TOKEN || '').trim()
  if (!token) {
    return res.status(503).json({
      ok: false,
      error: 'Set GITHUB_PAT in Vercel project env (Settings → Environment Variables)',
    })
  }

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  const dispatchRes = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({ event_type: EVENT }),
  })

  if (dispatchRes.status === 204) {
    return res.status(200).json({
      ok: true,
      method: 'repository_dispatch',
      dispatched: EVENT,
      repo: REPO,
      at: new Date().toISOString(),
    })
  }

  const dispatchDetail = await dispatchRes.text()

  const workflowRes = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/treasury-agent.yml/dispatches`,
    {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: 'master' }),
    },
  )

  if (workflowRes.status === 204) {
    return res.status(200).json({
      ok: true,
      method: 'workflow_dispatch',
      workflow: 'treasury-agent.yml',
      repo: REPO,
      at: new Date().toISOString(),
    })
  }

  const workflowDetail = await workflowRes.text()
  const hint = dispatchRes.status === 404 || workflowRes.status === 404
    ? 'PAT cannot access this repo — use a classic PAT with repo scope from the Fraeiy account, or fine-grained with Actions:Read/Write on Fraeiy/sphere-predict. Re-paste GITHUB_PAT in Vercel (no spaces) and redeploy.'
    : 'Check PAT expiry and permissions.'

  return res.status(502).json({
    ok: false,
    error: `GitHub dispatch failed (repository_dispatch=${dispatchRes.status}, workflow_dispatch=${workflowRes.status})`,
    hint,
    detail: dispatchDetail.slice(0, 200) || workflowDetail.slice(0, 200),
    repo: REPO,
  })
}