/**
 * Autonomous treasury agent — fulfills withdrawal queue on Unicity testnet2.
 *
 * Required env:
 *   TREASURY_MNEMONIC      — mnemonic for @sphere-predict treasury wallet
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   SPHERE_ORACLE_API_KEY  — testnet2 gateway key (see sphere-sdk README)
 *   MAX_AUTO_WITHDRAWAL_UCT (default 500)
 *   MAX_PER_RUN (default 5)
 *   STALE_PROCESSING_MINUTES (default 10)
 *
 * Usage:
 *   node backend/treasury-worker.mjs          # one pass
 *   node backend/treasury-worker.mjs --loop   # poll every 60s
 */

import { createClient } from '@supabase/supabase-js'
import { Sphere } from '@unicitylabs/sphere-sdk'
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs'
import { UCT_COIN_ID, normalizeRecipient, toRawString } from './lib/constants.mjs'

const LOOP = process.argv.includes('--loop')
const POLL_MS = Number(process.env.TREASURY_POLL_MS || 60_000)
const MAX_AMOUNT = Number(process.env.MAX_AUTO_WITHDRAWAL_UCT || 500)
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 5)
const STALE_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 10)

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

function txReference(result) {
  if (!result) return `treasury_send_${Date.now()}`
  if (typeof result === 'string') return result
  return (
    result.txReference ||
    result.tx_reference ||
    result.transactionId ||
    result.id ||
    result.hash ||
    JSON.stringify(result).slice(0, 240)
  )
}

async function initSphere() {
  const mnemonic = requireEnv('TREASURY_MNEMONIC')
  const apiKey = process.env.SPHERE_ORACLE_API_KEY
  const providers = createNodeProviders({
    network: 'testnet',
    ...(apiKey ? { oracle: { apiKey } } : {}),
  })
  const { sphere } = await Sphere.init({ ...providers, mnemonic })
  const address = sphere.identity?.nametag || sphere.identity?.directAddress || 'unknown'
  console.log(`[treasury-agent] wallet ready: ${address}`)
  return sphere
}

async function getBalance(db, userId) {
  const { data } = await db.from('balances').select('available_balance').eq('user_id', userId).single()
  return Number(data?.available_balance || 0)
}

async function setBalance(db, userId, amount) {
  await db.from('balances').upsert({
    user_id: userId,
    available_balance: amount,
    updated_at: new Date().toISOString(),
  })
}

async function notify(db, userId, title, body, metadata = {}) {
  await db.from('notifications').insert({
    user_id: userId,
    type: 'withdrawal',
    title,
    body,
    metadata,
  }).catch(() => {})
}

async function resetStaleProcessing(db) {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
  const { data } = await db.from('withdrawals')
    .update({ status: 'submitted', processing_at: null })
    .eq('status', 'processing')
    .lt('processing_at', cutoff)
    .select('id')
  if (data?.length) {
    console.log(`[treasury-agent] reset ${data.length} stale processing withdrawal(s)`)
  }
}

async function processWithdrawals(db, sphere) {
  await resetStaleProcessing(db)

  const { data: pending, error } = await db.from('withdrawals')
    .select('*, users(nametag, wallet_address)')
    .eq('status', 'submitted')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) throw error
  if (!pending?.length) {
    console.log('[treasury-agent] no pending withdrawals')
    return 0
  }

  let processed = 0

  for (const w of pending) {
    const amount = Number(w.amount)
    const user = w.users
    const recipientRaw = user?.nametag || user?.wallet_address

    if (!recipientRaw) {
      await failWithdrawal(db, w, 'User has no nametag or wallet address', { recredit: true })
      continue
    }
    if (!amount || amount <= 0) {
      await failWithdrawal(db, w, 'Invalid amount', { recredit: true })
      continue
    }
    if (amount > MAX_AMOUNT) {
      console.log(`[treasury-agent] skip ${w.id}: ${amount} UCT exceeds MAX_AUTO_WITHDRAWAL_UCT=${MAX_AMOUNT}`)
      continue
    }

    const { data: locked, error: lockErr } = await db.from('withdrawals')
      .update({ status: 'processing', processing_at: new Date().toISOString() })
      .eq('id', w.id)
      .eq('status', 'submitted')
      .select()
      .single()

    if (lockErr || !locked) continue

    const recipient = normalizeRecipient(recipientRaw)
    const memo = `SPHERE_PREDICT_WITHDRAW:${w.id}`

    try {
      console.log(`[treasury-agent] sending ${amount} UCT → ${recipient} (${w.id})`)
      const result = await sphere.payments.send({
        recipient,
        amount: toRawString(amount),
        coinId: UCT_COIN_ID,
        memo,
      })
      const ref = txReference(result)
      await db.from('withdrawals').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        tx_reference: String(ref),
        failure_reason: null,
      }).eq('id', w.id)

      await notify(
        db,
        w.user_id,
        'Withdrawal sent',
        `${amount.toFixed(2)} UCT sent from treasury to ${recipient}.`,
        { withdrawalId: w.id, amount, txReference: ref, agent: 'treasury-worker' },
      )
      console.log(`[treasury-agent] completed ${w.id} tx=${ref}`)
      processed += 1
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.error(`[treasury-agent] failed ${w.id}:`, reason)
      await failWithdrawal(db, w, reason, { recredit: true })
    }
  }

  return processed
}

async function failWithdrawal(db, w, reason, { recredit = false } = {}) {
  if (recredit) {
    const bal = await getBalance(db, w.user_id)
    await setBalance(db, w.user_id, bal + Number(w.amount))
  }
  await db.from('withdrawals').update({
    status: 'failed',
    failure_reason: reason.slice(0, 500),
    processing_at: null,
  }).eq('id', w.id)
  await notify(
    db,
    w.user_id,
    'Withdrawal failed',
    `Could not send ${Number(w.amount).toFixed(2)} UCT — balance restored. ${reason}`,
    { withdrawalId: w.id, agent: 'treasury-worker' },
  )
}

async function runOnce() {
  const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const sphere = await initSphere()
  const n = await processWithdrawals(db, sphere)
  console.log(`[treasury-agent] done — processed ${n} withdrawal(s)`)
}

async function main() {
  if (!LOOP) {
    await runOnce()
    return
  }
  console.log(`[treasury-agent] loop mode — poll every ${POLL_MS}ms`)
  for (;;) {
    try {
      await runOnce()
    } catch (e) {
      console.error('[treasury-agent] run error:', e instanceof Error ? e.message : e)
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

main().catch(e => {
  console.error('[treasury-agent] fatal:', e)
  process.exit(1)
})