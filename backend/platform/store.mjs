import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { fileURLToPath } from 'node:url'

const PLATFORM_DIR = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(PLATFORM_DIR, 'data')

const FILES = {
  users: 'users.json',
  balances: 'balances.json',
  markets: 'markets.json',
  positions: 'positions.json',
  trades: 'trades.json',
  deposits: 'deposits.json',
  withdrawals: 'withdrawals.json',
  notifications: 'notifications.json',
  resolutions: 'market_resolutions.json',
  treasury: 'treasury.json',
}

const cache = {}

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

async function loadTable(name, fallback = []) {
  if (cache[name]) return cache[name]
  await ensureDir()
  const file = path.join(DATA_DIR, FILES[name])
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      cache[name] = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? parsed : fallback)
      return cache[name]
    }
  } catch { /* ignore */ }
  cache[name] = fallback
  return cache[name]
}

async function saveTable(name) {
  await ensureDir()
  const file = path.join(DATA_DIR, FILES[name])
  const tmp = file + '.tmp'
  const data = cache[name]
  const payload = Array.isArray(data) ? data : data
  await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
  await rename(tmp, file)
}

export function newId() {
  return randomUUID()
}

export async function getUsers() {
  return loadTable('users', [])
}

export async function getBalances() {
  return loadTable('balances', {})
}

export async function getMarkets() {
  return loadTable('markets', [])
}

export async function getPositions() {
  return loadTable('positions', [])
}

export async function getTrades() {
  return loadTable('trades', [])
}

export async function getDeposits() {
  return loadTable('deposits', [])
}

export async function getWithdrawals() {
  return loadTable('withdrawals', [])
}

export async function getNotifications() {
  return loadTable('notifications', [])
}

export async function getResolutions() {
  return loadTable('resolutions', [])
}

export async function getTreasury() {
  const t = await loadTable('treasury', { address: '', updatedAt: null })
  return t
}

export async function setTreasury(address) {
  cache.treasury = { address, updatedAt: new Date().toISOString() }
  await saveTable('treasury')
  return cache.treasury
}

export async function persist(name) {
  await saveTable(name)
}

export async function seedMarketsIfEmpty() {
  const markets = await getMarkets()
  if (markets.length) return markets
  const now = Date.now()
  const seeds = [
    { question: 'Will ETH surpass BTC in market cap by Q4 2026?', category: 'CRYPTO', status: 'open', deadline: new Date(now + 90 * 864e5).toISOString(), yes_pool: 3200, no_pool: 800, volume: 4000, trending_score: 95 },
    { question: 'Will the US Federal Reserve cut rates in June 2026?', category: 'FINANCE', status: 'open', deadline: new Date(now + 28 * 864e5).toISOString(), yes_pool: 1500, no_pool: 2100, volume: 3600, trending_score: 88 },
    { question: 'Will a Layer 2 blockchain exceed 10M daily transactions by July 2026?', category: 'CRYPTO', status: 'open', deadline: new Date(now + 45 * 864e5).toISOString(), yes_pool: 900, no_pool: 600, volume: 1500, trending_score: 72 },
    { question: 'Will Sphere SDK reach 1,000 GitHub stars by September 2026?', category: 'TECH', status: 'open', deadline: new Date(now + 120 * 864e5).toISOString(), yes_pool: 400, no_pool: 1100, volume: 1500, trending_score: 65 },
    { question: 'Will there be a G7 emergency summit on AI regulation in 2026?', category: 'POLITICS', status: 'open', deadline: new Date(now + 60 * 864e5).toISOString(), yes_pool: 700, no_pool: 2300, volume: 3000, trending_score: 58 },
    { question: 'Will any team score 200+ points in an NBA game by 2027?', category: 'SPORTS', status: 'open', deadline: new Date(now + 200 * 864e5).toISOString(), yes_pool: 250, no_pool: 1750, volume: 2000, trending_score: 41 },
    { question: 'Will Anthropic release a new flagship model before July 2026?', category: 'TECH', status: 'resolved', deadline: new Date(now - 10 * 864e5).toISOString(), yes_pool: 3000, no_pool: 1000, volume: 4000, trending_score: 0, resolution: 'YES', resolved_at: new Date(now - 5 * 864e5).toISOString() },
  ].map(m => ({ id: newId(), ...m, created_at: new Date().toISOString() }))
  cache.markets = seeds
  await saveTable('markets')
  return seeds
}

export { DATA_DIR }