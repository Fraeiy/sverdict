/**
 * Testnet treasury top-up — Sphere has no HTTP faucet on testnet2.
 * Self-mint UCT via sphere.payments.mintFungibleToken (official SDK path).
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { humanToRawBigInt } from './amount.mjs'
import { sphereDataDirs, sphereNetwork } from './sphereConfig.mjs'
import { getUctDecimals, resolveUctCoinId } from './sphereProviders.mjs'
import { formatWithdrawalAmount } from './withdrawAmount.mjs'
import { resolveUctDecimals } from './uctAmount.mjs'

const DEFAULT_INTERVAL_MS = Number(process.env.TREASURY_FAUCET_INTERVAL_MS || 3_600_000)
const DEFAULT_MIN_BALANCE = Number(process.env.TREASURY_FAUCET_MIN_BALANCE_UCT || 100)
/** Match Sphere wallet UI testnet top-up (~100 UCT). SDK allows more; 100 is safer. */
const DEFAULT_MINT_UCT = Number(process.env.TREASURY_FAUCET_MINT_UCT || 100)

function isTestnetNetwork() {
  const net = String(sphereNetwork() || '').trim().toLowerCase()
  return net === 'testnet' || net === 'testnet2' || net.includes('test')
}

export function treasuryFaucetEnabled() {
  const flag = process.env.TREASURY_FAUCET_ENABLED
  if (flag != null && String(flag).trim() !== '') {
    const v = String(flag).trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  }
  return isTestnetNetwork()
}

async function faucetStatePath() {
  const { dataDir } = sphereDataDirs()
  return path.join(dataDir, 'faucet-last.json')
}

async function readLastFaucetAt() {
  try {
    const file = await faucetStatePath()
    if (!existsSync(file)) return 0
    const raw = JSON.parse(await readFile(file, 'utf8'))
    const ts = Number(raw?.lastAt || 0)
    return Number.isFinite(ts) ? ts : 0
  } catch {
    return 0
  }
}

async function writeLastFaucetAt(ts = Date.now()) {
  const file = await faucetStatePath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ lastAt: ts, iso: new Date(ts).toISOString() }, null, 2), 'utf8')
}

/**
 * Hourly testnet top-up when spendable UCT is below threshold.
 * @param {object} sphere
 * @param {{ spendableHuman?: number, dryRun?: boolean }} opts
 */
export async function maybeTreasuryFaucet(sphere, { spendableHuman = 0, dryRun = false } = {}) {
  if (!treasuryFaucetEnabled()) {
    return { skipped: true, reason: 'disabled' }
  }
  if (!isTestnetNetwork()) {
    return { skipped: true, reason: 'not-testnet' }
  }
  if (!dryRun && typeof sphere?.payments?.mintFungibleToken !== 'function') {
    return { skipped: true, reason: 'mint-unavailable' }
  }

  const minBalance = DEFAULT_MIN_BALANCE
  const mintHuman = DEFAULT_MINT_UCT
  const intervalMs = DEFAULT_INTERVAL_MS

  const lastAt = await readLastFaucetAt()
  const elapsed = Date.now() - lastAt
  if (elapsed < intervalMs) {
    const mins = Math.ceil((intervalMs - elapsed) / 60_000)
    return { skipped: true, reason: 'cooldown', nextInMinutes: mins }
  }

  if (spendableHuman >= minBalance) {
    return { skipped: true, reason: 'balance-ok', spendableHuman }
  }

  const coinId = resolveUctCoinId()
  const decimals = resolveUctDecimals(getUctDecimals())
  const mintRaw = humanToRawBigInt(mintHuman, decimals)
  if (mintRaw <= 0n) {
    return { skipped: true, reason: 'invalid-mint-amount' }
  }

  if (dryRun) {
    console.log(
      `[treasury-agent] dry-run faucet — would self-mint ${formatWithdrawalAmount(mintHuman)} UCT `
      + `(spendable ${formatWithdrawalAmount(spendableHuman)} < ${formatWithdrawalAmount(minBalance)})`,
    )
    return { skipped: false, dryRun: true, wouldMint: mintHuman }
  }

  console.log(
    `[treasury-agent] testnet faucet — self-minting ${formatWithdrawalAmount(mintHuman)} UCT `
    + `(spendable ${formatWithdrawalAmount(spendableHuman)} UCT, threshold ${formatWithdrawalAmount(minBalance)})`,
  )

  const result = await sphere.payments.mintFungibleToken(coinId, mintRaw)
  if (!result?.success) {
    const err = result?.error || 'mintFungibleToken failed'
    console.warn('[treasury-agent] faucet mint failed:', err)
    return { skipped: false, failed: true, error: err }
  }

  await writeLastFaucetAt()

  try {
    await sphere.payments.receive?.()
  } catch { /* best-effort */ }

  console.log(
    `[treasury-agent] faucet minted ${formatWithdrawalAmount(mintHuman)} UCT — token ${result.tokenId || 'ok'}`,
  )

  return {
    skipped: false,
    minted: mintHuman,
    tokenId: result.tokenId,
  }
}