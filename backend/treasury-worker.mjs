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
import { Sphere } from '@unicitylabs/sphere-sdk'
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs'
import { UCT_COIN_ID, normalizeRecipient, rawToHuman, toRawString } from './lib/constants.mjs'
import { loadProjectEnv } from './lib/loadEnv.mjs'
import {
  sphereDataDirs,
  sphereNetwork,
  sphereOracleApiKey,
  sphereTokenSync,
  treasuryAutoMintEnabled,
  treasuryMintTopupUct,
} from './lib/sphereConfig.mjs'

loadProjectEnv()

const LOOP = process.argv.includes('--loop')
const DRY_RUN = process.argv.includes('--dry-run')
const STATUS_ONLY = process.argv.includes('--status')
const POLL_MS = Number(process.env.TREASURY_POLL_MS || 60_000)
const MAX_AMOUNT = Number(process.env.MAX_AUTO_WITHDRAWAL_UCT || 500)
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 5)
const STALE_MINUTES = Number(process.env.STALE_PROCESSING_MINUTES || 10)

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
  const network = sphereNetwork()
  if (!network) throw new Error('SPHERE_NETWORK resolved empty — set SPHERE_NETWORK=testnet or unset it')
  const { dataDir, tokensDir } = sphereDataDirs()
  console.log(`[treasury-agent] initializing Sphere wallet (network=${network})`)
  const providers = createNodeProviders({
    network,
    dataDir,
    tokensDir,
    oracle: { apiKey: sphereOracleApiKey() },
    tokenSync: sphereTokenSync(),
  })
  // createNodeProviders does NOT return `network` — pass it explicitly to Sphere.init
  const { sphere } = await Sphere.init({
    network,
    mnemonic,
    storage: providers.storage,
    transport: providers.transport,
    oracle: providers.oracle,
    tokenStorage: providers.tokenStorage,
    price: providers.price,
    groupChat: providers.groupChat,
    market: providers.market,
  })
  if (providers.ipfsTokenStorage) {
    await sphere.addTokenStorageProvider(providers.ipfsTokenStorage)
    console.log('[treasury-agent] IPFS token sync provider registered')
  } else {
    console.warn('[treasury-agent] IPFS token sync unavailable — UCT received in browser wallet may not be visible')
  }
  const nametag = sphere.identity?.nametag || ''
  const direct = sphere.identity?.directAddress || ''
  console.log(`[treasury-agent] wallet ready: ${nametag || direct || 'unknown'}`)
  return sphere
}

/** Decimals from live UCT asset metadata (set during prepareTreasurySphere). */
let treasuryUctDecimals = 18

async function getUctBalance(sphere) {
  const assets = await sphere.payments.getAssets()
  const uct = (assets || []).find(a =>
    a.symbol === 'UCT' || a.coinId?.toLowerCase() === UCT_COIN_ID.toLowerCase(),
  )
  const decimals = Number(uct?.decimals ?? 18)
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
    console.log('[treasury-agent] connecting Nostr transport…')
    await sphere.reconnect()
    console.log('[treasury-agent] transport connected')
  } catch (e) {
    console.warn('[treasury-agent] transport connect failed:', e instanceof Error ? e.message : e)
  }

  try {
    console.log('[treasury-agent] receiving pending token transfers (Nostr)…')
    const received = await sphere.payments.receive()
    const n = received?.transfers?.length ?? 0
    console.log(`[treasury-agent] receive done — new transfers=${n}`)
  } catch (e) {
    console.warn('[treasury-agent] payments.receive failed:', e instanceof Error ? e.message : e)
  }

  try {
    console.log('[treasury-agent] syncing token inventory (IPFS)…')
    const syncResult = await sphere.payments.sync()
    console.log(`[treasury-agent] sync done — added=${syncResult?.added ?? 0} removed=${syncResult?.removed ?? 0}`)
  } catch (e) {
    console.warn('[treasury-agent] payments.sync failed:', e instanceof Error ? e.message : e)
  }

  let bal = await getUctBalance(sphere).catch(e => {
    console.warn('[treasury-agent] getAssets failed:', e instanceof Error ? e.message : e)
    return { raw: 0n, decimals: 18, human: 0, asset: null }
  })
  logUctBalance(bal, 'after ingest')
  treasuryUctDecimals = bal.decimals

  const minRaw = BigInt(toRawString(1, bal.decimals))
  if (bal.raw < minRaw && treasuryAutoMintEnabled()) {
    const topup = treasuryMintTopupUct()
    console.log(`[treasury-agent] testnet auto-mint ${topup} UCT (spendable below 1 UCT)`)
    const minted = await sphere.payments.mintFungibleToken(UCT_COIN_ID, topup)
    if (minted?.success) {
      console.log(`[treasury-agent] mint ok — token ${minted.tokenId || minted.token?.id || 'created'}`)
      bal = await getUctBalance(sphere)
      treasuryUctDecimals = bal.decimals
      logUctBalance(bal, 'after mint')
    } else {
      console.warn('[treasury-agent] auto-mint failed:', minted?.error || 'unknown error')
    }
  } else if (bal.raw < minRaw) {
    console.warn('[treasury-agent] insufficient spendable UCT for 1 UCT send — enable testnet auto-mint (default on)')
  }

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
  const { error } = await db.from('notifications').insert({
    user_id: userId,
    type: 'withdrawal',
    title,
    body,
    metadata,
  })
  if (error) console.warn('[treasury-agent] notify failed:', error.message)
}

function isTreasuryFundsError(reason) {
  return /insufficient balance/i.test(reason)
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
  return counts
}

async function processWithdrawals(db, sphere, { dryRun = false } = {}) {
  if (!dryRun) await resetStaleProcessing(db)

  const { data: pending, error } = await db.from('withdrawals')
    .select('*, users(nametag, wallet_address)')
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

    const recipient = normalizeRecipient(recipientRaw)
    const memo = `SPHERE_PREDICT_WITHDRAW:${w.id}`

    if (dryRun) {
      console.log(`  → would send ${amount} UCT to ${recipient} (${w.id}) memo=${memo}`)
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

    try {
      const sendRaw = toRawString(amount, treasuryUctDecimals)
      console.log(`[treasury-agent] sending ${amount} UCT (raw=${sendRaw}, decimals=${treasuryUctDecimals}) → ${recipient} (${w.id})`)
      const result = await sphere.payments.send({
        recipient,
        amount: sendRaw,
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
      const treasuryEmpty = isTreasuryFundsError(reason)
      await failWithdrawal(db, w, reason, {
        recredit: !treasuryEmpty,
        requeue: treasuryEmpty,
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
      `[treasury-agent] requeued ${w.id} — @sphere-predict treasury needs more on-chain UCT (deposits fund the ledger; treasury wallet must hold UCT to pay out)`,
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
    console.log('[treasury-agent] DRY-RUN — no wallet init, no DB writes, no on-chain sends')
    const n = await processWithdrawals(db, null, { dryRun: true })
    console.log(`[treasury-agent] dry-run done — would process ${n} withdrawal(s)`)
    return
  }

  const sphere = await prepareTreasurySphere(await initSphere())
  const n = await processWithdrawals(db, sphere)
  console.log(`[treasury-agent] done — processed ${n} withdrawal(s)`)
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