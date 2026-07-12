/**
 * CI-friendly treasury loop — runs worker passes for a fixed wall time then exits.
 * Used by GitHub Actions where schedule triggers are best-effort (often 15–60+ min late).
 *
 * Env:
 *   TREASURY_CI_LOOP_MS  — total runtime (default 8 min)
 *   TREASURY_POLL_MS     — pause between passes (default 60s)
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const LOOP_MS = Number(process.env.TREASURY_CI_LOOP_MS || 8 * 60_000)
const POLL_MS = Number(process.env.TREASURY_POLL_MS || 60_000)
const workerPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'treasury-worker.mjs')

function runPass() {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn(process.execPath, [workerPath], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', reject)
    child.on('close', code => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(1)
      if (code === 0) {
        console.log(`[treasury-ci-loop] pass ok (${elapsed}s)`)
        resolve()
      } else {
        reject(new Error(`treasury-worker exited ${code} after ${elapsed}s`))
      }
    })
  })
}

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms))
}

const deadline = Date.now() + LOOP_MS
let pass = 0

console.log(`[treasury-ci-loop] starting — loop ${LOOP_MS}ms, poll ${POLL_MS}ms`)

while (Date.now() < deadline) {
  pass += 1
  console.log(`[treasury-ci-loop] pass ${pass} at ${new Date().toISOString()}`)
  try {
    await runPass()
  } catch (e) {
    console.error('[treasury-ci-loop] pass failed:', e instanceof Error ? e.message : e)
  }
  const remaining = deadline - Date.now()
  if (remaining <= 0) break
  const wait = Math.min(POLL_MS, remaining)
  console.log(`[treasury-ci-loop] sleeping ${Math.round(wait / 1000)}s (${Math.round(remaining / 1000)}s left)`)
  await sleep(wait)
}

console.log(`[treasury-ci-loop] done — ${pass} pass(es)`)