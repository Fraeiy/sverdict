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
 *   node backend/treasury-worker.mjs              # one pass
 *   node backend/treasury-worker.mjs --loop       # poll every 60s
 *   node backend/treasury-worker.mjs --dry-run    # preview queue, no sends
 *   node backend/treasury-worker.mjs --status     # queue counts only
 */

import { createClient } from '@supabase/supabase-js'
import { normalizeRecipient, rawToHuman } from './lib/constants.mjs'
import { buildWithdrawMemo } from './lib/paymentMemos.mjs'
import { loadProjectEnv } from './lib/loadEnv.mjs'
import { processOutboundDms, queueWithdrawalSentDm } from './lib/outboundDm.mjs'
import { consolidateTreasuryCoins } from './lib/treasuryConsolidate.mjs'
import { estimateDeliveryCount, summarizeUctInventory } from './lib/treasuryInventory.mjs'
import { publishTreasuryStatus } from './lib/treasuryStatus.mjs'
import { formatWithdrawalAmount, normalizeWithdrawalAmount, withdrawalAmountToRaw } from './lib/withdrawAmount.mjs'
import { buildSeedMemo } from './lib/paymentMemos.mjs'
import { getUctCoinId, getUctDecimals, initTreasurySphere } from './lib/sphereProviders.mjs'

loadProjectEnv()

const LOOP = process.argv.includes('--loop')
const DRY_RUN = process.argv.includes('--dry-run')
const STATUS_ONLY = process.argv.includes('--status')
const POLL_MS = Number(process.env.TREASURY_POLL_MS || 60_000)
const MAX_AMOUNT = Number(process.env.MAX_AUTO_WITHDRAWAL_UCT || 500)
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 5)
const MAX_SEEDS_PER_RUN = Number(process.env.MAX_SEEDS_PER_RUN || 3)
const STALE_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 10)
const MARKET_SEED_LIQUIDITY_UCT = Number(process.env.MARKET_SEED_LIQUIDITY_UCT || 100)
const UCT_COIN_ID = getUctCoinId()

function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    const hint = name === 'SUPABASE_SERVICE_ROLE_KEY'
      ? 'Add to .env — Supabase Dashboard → Settings → API → service_role (secret)'
      : name === 'SUPABASE_URL'
        ? 'Add SUPABASE_URL or VITE_SUPABASE_URL to .env'
        : name === 'TREASURY_MNEMONIC'
          ? 'Add TREASURY_MNEMONIC to .env (only needed for live sends, not --status/--dry-run)'
          : ''
    throw new Error(`Missing required env: ${name}${hint ? ` — ${hint}` : ''}`)
  }
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
  console.log('[treasury-agent] initializing Sphere wallet (v2 wallet-api providers)')
  const sphere = await initTreasurySphere({ mnemonic })
  const nametag = sphere.identity?.nametag || ''
  const direct = sphere.identity?.directAddress || ''
  console.log(`[treasury-agent] wallet ready: ${nametag || direct || 'unknown'}`)
  return sphere
}

/** UCT decimals from TokenRegistry (authoritative for send amounts). */
let treasuryUctDecimals = getUctDecimals()

async function getUctBalance(sphere) {
  const assets = await sphere.payments.getAssets()
  const uct = (assets || []).find(a =>
    a.symbol === 'UCT' || a.coinId?.toLowerCase() === UCT_COIN_ID.toLowerCase(),
  )
  const decimals = treasuryUctDecimals
  const rawStr = uct?.totalAmount ?? uct?.balance ?? uct?.amount ?? '0'
  const raw = BigInt(String(rawStr || 0))
  return { raw, decimals, human: rawToHuman(raw, decimals), asset: uct }
}

function logUctBalance(bal, phase = '') {
  const label = phase ? ` ${phase}` : ''
  console.log(
    `[treasury-agent] spendable UCT${label}: ~${bal.human.toFixed(4)} (raw=${bal.raw}, decimals=${bal.decimals})`,
  )
}

async function prepareTreasurySphere(sphere) {
  const expectedNametag = (process.env.TREASURY_NAMETAG || 'sphere-predict').replace(/^@/, '').toLowerCase()
  const actualNametag = (sphere.identity?.nametag || '').replace(/^@/, '').toLowerCase()
  const direct = sphere.identity?.directAddress || '—'
  console.log(`[treasury-agent] identity @${actualNametag || '—'} | ${direct}`)

  if (actualNametag && actualNametag !== expectedNametag) {
    console.warn(
      `[treasury-agent] WARNING: mnemonic unlocks @${actualNametag}, expected @${expectedNametag} — user deposits may not land in this wallet`,
    )
  }

  try {
    console.log('[treasury-agent] draining wallet-api mailbox…')
    const received = await sphere.payments.receive()
    const n = received?.transfers?.length ?? 0
    console.log(`[treasury-agent] receive done — new transfers=${n}`)
  } catch (e) {
    console.warn('[treasury-agent] payments.receive failed:', e instanceof Error ? e.message : e)
  }

  try {
    console.log('[treasury-agent] syncing optional IPFS token backup…')
    const syncResult = await sphere.payments.sync()
    console.log(`[treasury-agent] sync done — added=${syncResult?.added ?? 0} removed=${syncResult?.removed ?? 0}`)
  } catch (e) {
    console.warn('[treasury-agent] payments.sync failed:', e instanceof Error ? e.message : e)
  }

  treasuryUctDecimals = getUctDecimals()
  console.log(`[treasury-agent] UCT decimals (TokenRegistry): ${treasuryUctDecimals}`)

  let bal = await getUctBalance(sphere).catch(e => {
    console.warn('[treasury-agent] getAssets failed:', e instanceof Error ? e.message : e)
    return { raw: 0n, decimals: treasuryUctDecimals, human: 0, asset: null }
  })
  logUctBalance(bal, 'wallet-api inventory')

  return sphere
}

async function refreshSpendableInventory(sphere) {
  try {
    await sphere.payments.receive()
  } catch { /* best-effort */ }
  return getUctBalance(sphere)
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
  const { error } = await db.from('notifications').insert({
    user_id: userId,
    type: 'withdrawal',
    title,
    body,
    metadata,
  })
  if (error) console.warn('[treasury-agent] notify failed:', error.message)
}

function isSpendableInventoryError(reason) {
  return /insufficient balance/i.test(reason)
}

function isSendSettled(status) {
  return status === 'confirmed' || status === 'delivered' || status === 'completed'
}

function countRecipientDeliveries(result) {
  const transfers = result?.tokenTransfers
  if (Array.isArray(transfers) && transfers.length > 0) {
    return transfers.filter(t => t?.method === 'direct' || t?.method === 'split').length
  }
  const tokens = result?.tokens
  return Array.isArray(tokens) ? tokens.length : 1
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

async function showStatus(db) {
  const statuses = ['submitted', 'processing', 'completed', 'failed']
  const counts = {}
  for (const status of statuses) {
    const { count } = await db.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', status)
    counts[status] = count ?? 0
  }
  console.log('[treasury-agent] withdrawal queue status:')
  for (const status of statuses) {
    console.log(`  ${status}: ${counts[status]}`)
  }

  const seedStatuses = ['pending', 'processing', 'completed', 'failed']
  const seedCounts = {}
  for (const status of seedStatuses) {
    const { count } = await db.from('markets').select('*', { count: 'exact', head: true }).eq('seed_status', status)
    seedCounts[status] = count ?? 0
  }
  console.log('[treasury-agent] market seed queue status:')
  for (const status of seedStatuses) {
    console.log(`  ${status}: ${seedCounts[status]}`)
  }
  return { withdrawals: counts, seeds: seedCounts }
}

function treasuryRecipient(sphere) {
  const tag = (sphere.identity?.nametag || process.env.TREASURY_NAMETAG || 'sphere-predict')
    .replace(/^@/, '')
  return `@${tag}`
}

async function resetStaleSeedProcessing(db) {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
  const { data } = await db.from('markets')
    .update({ seed_status: 'pending', seed_processing_at: null })
    .eq('seed_status', 'processing')
    .lt('seed_processing_at', cutoff)
    .select('id')
  if (data?.length) {
    console.log(`[treasury-agent] reset ${data.length} stale processing market seed(s)`)
  }
}

async function failMarketSeed(db, market, reason, { requeue = false } = {}) {
  if (requeue) {
    await db.from('markets').update({
      seed_status: 'pending',
      seed_failure_reason: reason.slice(0, 500),
      seed_processing_at: null,
    }).eq('id', market.id)
    console.warn(`[treasury-agent] requeued seed ${market.id}: ${reason}`)
    return
  }

  await db.from('markets').update({
    status: 'closed',
    seed_status: 'failed',
    seed_failure_reason: reason.slice(0, 500),
    seed_processing_at: null,
  }).eq('id', market.id)
  console.error(`[treasury-agent] seed failed ${market.id}: ${reason}`)
}

async function processMarketSeeds(db, sphere, { dryRun = false } = {}) {
  if (!dryRun) await resetStaleSeedProcessing(db)

  const { data: pending, error } = await db.from('markets')
    .select('id, question, seed_liquidity, seed_payment_memo, created_by')
    .eq('seed_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_SEEDS_PER_RUN)

  if (error) throw error
  if (!pending?.length) {
    console.log(`[treasury-agent] no pending market seeds${dryRun ? ' (dry-run)' : ''}`)
    return 0
  }

  let processed = 0
  for (const market of pending) {
    const amount = normalizeWithdrawalAmount(market.seed_liquidity)
    if (!amount || amount <= 0) {
      if (!dryRun) {
        await db.from('markets').update({
          status: 'open',
          seed_status: 'skipped',
          seed_completed_at: new Date().toISOString(),
        }).eq('id', market.id)
      }
      processed += 1
      continue
    }

    const seedPerSide = amount / 2
    const memo = market.seed_payment_memo || buildSeedMemo({ marketId: market.id, amount })
    const sendRaw = withdrawalAmountToRaw(amount, treasuryUctDecimals)
    const recipient = treasuryRecipient(sphere)

    if (dryRun) {
      console.log(`  → would seed ${formatWithdrawalAmount(amount)} UCT for market ${market.id} memo=${memo}`)
      processed += 1
      continue
    }

    const { data: locked, error: lockErr } = await db.from('markets')
      .update({ seed_status: 'processing', seed_processing_at: new Date().toISOString() })
      .eq('id', market.id)
      .eq('seed_status', 'pending')
      .select()
      .single()
    if (lockErr || !locked) continue

    let sendCompleted = false
    try {
      let bal = await refreshSpendableInventory(sphere)
      if (bal.raw < sendRaw) {
        bal = await refreshSpendableInventory(sphere)
      }
      if (bal.raw < sendRaw) {
        await failMarketSeed(db, market, `Treasury has only ${formatWithdrawalAmount(bal.human)} UCT spendable on-chain`, {
          requeue: true,
        })
        continue
      }

      const inventory = summarizeUctInventory(sphere)
      if (inventory.largestRaw < sendRaw) {
        console.warn(
          `[treasury-agent] seed ${market.id}: no single coin ≥ ${formatWithdrawalAmount(amount)} UCT `
          + `(${inventory.tokenCount} coins) — consolidation may help next pass`,
        )
      }

      console.log(
        `[treasury-agent] seeding ${formatWithdrawalAmount(amount)} UCT on-chain for market ${market.id} `
        + `(self-attest → ${recipient})`,
      )
      const result = await sphere.payments.send({
        recipient,
        amount: String(sendRaw),
        coinId: 'UCT',
        memo,
        transferMode: 'conservative',
      })
      sendCompleted = true

      if (typeof sphere.payments.waitForPendingOperations === 'function') {
        await sphere.payments.waitForPendingOperations()
      }
      if (!isSendSettled(result?.status)) {
        throw new Error(`Seed send did not settle (status=${result?.status || 'unknown'})`)
      }

      try {
        await sphere.payments.receive()
      } catch { /* best-effort ingest */ }

      const ref = txReference(result)
      const { error: completeErr } = await db.from('markets').update({
        status: 'open',
        seed_status: 'completed',
        seed_completed_at: new Date().toISOString(),
        seed_tx_reference: String(ref),
        seed_payment_memo: memo,
        seed_failure_reason: null,
        yes_pool: seedPerSide,
        no_pool: seedPerSide,
        volume: amount,
        trending_score: 10 + amount * 0.1,
      }).eq('id', market.id).eq('seed_status', 'processing')
      if (completeErr) throw completeErr

      if (market.created_by) {
        await notify(
          db,
          market.created_by,
          'market',
          'Market live',
          `"${String(market.question || '').slice(0, 60)}" is live — ${formatWithdrawalAmount(amount)} UCT seeded on-chain.`,
          { marketId: market.id, seedTotal: amount, txReference: ref, agent: 'treasury-worker' },
        ).catch(() => {})
      }

      console.log(`[treasury-agent] seed completed ${market.id} tx=${ref}`)
      processed += 1
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.error(`[treasury-agent] seed failed ${market.id}:`, reason)
      const inventoryMismatch = isSpendableInventoryError(reason)
      await failMarketSeed(db, market, reason, {
        requeue: inventoryMismatch && !sendCompleted,
      })
    }
  }

  return processed
}

async function processWithdrawals(db, sphere, { dryRun = false } = {}) {
  if (!dryRun) await resetStaleProcessing(db)

  const { data: pending, error } = await db.from('withdrawals')
    .select('*, users(nametag, wallet_address, preferences)')
    .eq('status', 'submitted')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) throw error
  if (!pending?.length) {
    console.log(`[treasury-agent] no pending withdrawals${dryRun ? ' (dry-run)' : ''}`)
    return 0
  }

  if (dryRun) {
    console.log(`[treasury-agent] dry-run — ${pending.length} pending withdrawal(s):`)
  }

  let processed = 0

  for (const w of pending) {
    const amount = normalizeWithdrawalAmount(w.amount)
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

    const recipient = normalizeRecipient(recipientRaw)
    const memo = buildWithdrawMemo(w.id)
    const sendRaw = withdrawalAmountToRaw(amount, treasuryUctDecimals)

    if (dryRun) {
      console.log(`  → would send ${formatWithdrawalAmount(amount)} UCT to ${recipient} (${w.id}) memo=${memo}`)
      processed += 1
      continue
    }

    const { data: locked, error: lockErr } = await db.from('withdrawals')
      .update({ status: 'processing', processing_at: new Date().toISOString() })
      .eq('id', w.id)
      .eq('status', 'submitted')
      .select()
      .single()

    if (lockErr || !locked) continue

    let sendCompleted = false
    try {
      if (sendRaw <= 0n) {
        await failWithdrawal(db, w, 'Invalid raw amount after conversion', { recredit: true })
        continue
      }

      let bal = await refreshSpendableInventory(sphere)
      if (bal.raw < sendRaw) {
        console.warn(
          `[treasury-agent] agent inventory raw=${bal.raw} < needed ${sendRaw} — @sphere-predict is funded; check TREASURY_MNEMONIC / TREASURY_DEVICE_ID match the browser wallet`,
        )
        bal = await refreshSpendableInventory(sphere)
      }
      if (bal.raw < sendRaw) {
        await failWithdrawal(db, w, `Treasury has only ${formatWithdrawalAmount(bal.human)} UCT spendable on-chain`, {
          recredit: true,
          requeue: false,
        })
        continue
      }

      const inventory = summarizeUctInventory(sphere)
      const estDeliveries = estimateDeliveryCount(inventory.tokens, sendRaw)
      if (inventory.tokenCount > 1) {
        console.log(
          `[treasury-agent] treasury holds ${inventory.tokenCount} UCT coin(s); withdrawal ${w.id} `
          + `will likely arrive as ~${estDeliveries > 0 ? estDeliveries : '?'} Sphere transfer(s) `
          + `(largest coin ${formatWithdrawalAmount(inventory.largestHuman)} UCT)`,
        )
      }
      if (inventory.largestRaw < sendRaw) {
        console.warn(
          `[treasury-agent] no single treasury coin covers ${formatWithdrawalAmount(amount)} UCT — `
          + 'user will see multiple wallet notifications; total should still match',
        )
      }

      console.log(
        `[treasury-agent] sending ${formatWithdrawalAmount(amount)} UCT (raw=${sendRaw}, decimals=${treasuryUctDecimals}) → ${recipient} (${w.id})`,
      )
      const result = await sphere.payments.send({
        recipient,
        amount: String(sendRaw),
        coinId: 'UCT',
        memo,
        transferMode: 'conservative',
      })
      sendCompleted = true

      if (typeof sphere.payments.waitForPendingOperations === 'function') {
        await sphere.payments.waitForPendingOperations()
      }

      if (!isSendSettled(result?.status)) {
        throw new Error(`Send did not settle (status=${result?.status || 'unknown'})`)
      }

      const deliveryCount = countRecipientDeliveries(result)
      if (deliveryCount > 1) {
        console.log(
          `[treasury-agent] ${w.id} used ${deliveryCount} source token(s) — `
          + 'recipient may see multiple inbox entries with the same memo',
        )
      }

      const ref = txReference(result)

      // Persist completion immediately — do not let notify/DM failures requeue a successful on-chain send.
      const { error: completeErr } = await db.from('withdrawals').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        tx_reference: String(ref),
        payment_memo: memo,
        failure_reason: null,
      }).eq('id', w.id).eq('status', 'processing')
      if (completeErr) throw completeErr

      try {
        const deliveryNote = deliveryCount > 1
          ? ` Arrived as ${deliveryCount} Sphere transfers (same memo); total ${formatWithdrawalAmount(amount)} UCT.`
          : ''
        await notify(
          db,
          w.user_id,
          'Withdrawal sent',
          `${formatWithdrawalAmount(amount)} UCT sent from treasury to ${recipient}.${deliveryNote}`,
          { withdrawalId: w.id, amount, txReference: ref, deliveryCount, agent: 'treasury-worker' },
        )
        const dmPrefs = w.users?.preferences
        const dmOn = dmPrefs?.dmOnWithdrawal !== false
        if (dmOn) {
          await queueWithdrawalSentDm(db, w.users, {
            amount,
            txReference: ref,
            withdrawalId: w.id,
            paymentMemo: memo,
          })
        }
      } catch (sideErr) {
        console.warn('[treasury-agent] post-send notify/DM failed (withdrawal already completed):', sideErr instanceof Error ? sideErr.message : sideErr)
      }

      console.log(`[treasury-agent] completed ${w.id} tx=${ref}`)
      processed += 1
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.error(`[treasury-agent] failed ${w.id}:`, reason)
      const inventoryMismatch = isSpendableInventoryError(reason)
      await failWithdrawal(db, w, reason, {
        recredit: !inventoryMismatch && !sendCompleted,
        requeue: inventoryMismatch && !sendCompleted,
      })
    }
  }

  return processed
}

async function failWithdrawal(db, w, reason, { recredit = false, requeue = false } = {}) {
  if (recredit) {
    const bal = await getBalance(db, w.user_id)
    await setBalance(db, w.user_id, bal + Number(w.amount))
  }

  if (requeue) {
    const { error } = await db.from('withdrawals').update({
      status: 'submitted',
      failure_reason: reason.slice(0, 500),
      processing_at: null,
    }).eq('id', w.id)
    if (error) console.error(`[treasury-agent] requeue ${w.id} failed:`, error.message)
    console.warn(
      `[treasury-agent] requeued ${w.id} — spendable inventory low in agent (wallet is funded; verify mnemonic + deviceId match @sphere-predict wallet-api session)`,
    )
    return
  }

  const { error: updErr } = await db.from('withdrawals').update({
    status: 'failed',
    failure_reason: reason.slice(0, 500),
    processing_at: null,
  }).eq('id', w.id)
  if (updErr) console.error(`[treasury-agent] mark failed ${w.id}:`, updErr.message)

  await notify(
    db,
    w.user_id,
    'Withdrawal failed',
    recredit
      ? `Could not send ${Number(w.amount).toFixed(2)} UCT — balance restored. ${reason}`
      : `Could not send ${Number(w.amount).toFixed(2)} UCT. ${reason}`,
    { withdrawalId: w.id, agent: 'treasury-worker' },
  )
}

async function runOnce() {
  const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

  if (STATUS_ONLY) {
    await showStatus(db)
    return
  }

  if (DRY_RUN) {
    console.log('[treasury-agent] DRY-RUN — no wallet init, no on-chain sends')
    const seeds = await processMarketSeeds(db, null, { dryRun: true })
    const n = await processWithdrawals(db, null, { dryRun: true })
    console.log(`[treasury-agent] dry-run done — would process ${seeds} seed(s), ${n} withdrawal(s)`)
    return
  }

  const sphere = await prepareTreasurySphere(await initSphere())
  await consolidateTreasuryCoins(sphere)
  const seeds = await processMarketSeeds(db, sphere)
  const n = await processWithdrawals(db, sphere)
  await publishTreasuryStatus(db, sphere)
  const dms = await processOutboundDms(db, sphere)
  console.log(`[treasury-agent] done — processed ${seeds} seed(s), ${n} withdrawal(s), sent ${dms} DM(s)`)
}

async function main() {
  if (!LOOP) {
    await runOnce()
    return
  }
  if (DRY_RUN || STATUS_ONLY) {
    throw new Error('--dry-run and --status cannot be used with --loop')
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