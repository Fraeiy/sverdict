/**
 * Vercel Cron → GitHub repository_dispatch → Treasury Agent workflow.
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

  const token = process.env.GITHUB_PAT || process.env.GH_TOKEN
  if (!token) {
    return res.status(503).json({
      ok: false,
      error: 'Set GITHUB_PAT in Vercel project env (Settings → Environment Variables)',
    })
  }

  const url = `https://api.github.com/repos/${REPO}/dispatches`
  const gh = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: EVENT }),
  })

  if (gh.status === 204) {
    return res.status(200).json({
      ok: true,
      dispatched: EVENT,
      repo: REPO,
      at: new Date().toISOString(),
    })
  }

  const detail = await gh.text()
  return res.status(502).json({
    ok: false,
    error: `GitHub dispatch HTTP ${gh.status}`,
    detail: detail.slice(0, 400),
  })
}