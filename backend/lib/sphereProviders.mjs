/**
 * Sphere v2 provider wiring per official SDK docs:
 * https://github.com/unicity-sphere/sphere-sdk/blob/main/docs/QUICKSTART-NODEJS.md
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Sphere, TokenRegistry } from '@unicitylabs/sphere-sdk'
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs'
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api'
import {
  sphereDataDirs,
  sphereNetwork,
  sphereOracleApiKey,
  sphereTokenSync,
  sphereWalletApiBaseUrl,
  sphereWalletApiNetwork,
} from './sphereConfig.mjs'

async function resolveTreasuryDeviceId(dataDir) {
  const fromEnv = process.env.TREASURY_DEVICE_ID?.trim()
  if (fromEnv) return fromEnv

  const file = `${dataDir}/device-id.txt`
  if (existsSync(file)) {
    const id = (await readFile(file, 'utf8')).trim()
    if (id) return id
  }

  const id = `sphere-predict-treasury-${randomUUID()}`
  await mkdir(dataDir, { recursive: true })
  await writeFile(file, id, 'utf8')
  return id
}

/** Base + wallet-api providers required for v2 send/receive. */
export async function createTreasuryProviders() {
  const network = sphereNetwork()
  const v2Network = sphereWalletApiNetwork()
  const { dataDir, tokensDir } = sphereDataDirs()
  const deviceId = await resolveTreasuryDeviceId(dataDir)

  const base = createNodeProviders({
    network,
    dataDir,
    tokensDir,
    oracle: { apiKey: sphereOracleApiKey() },
    tokenSync: sphereTokenSync(),
  })

  const providers = createWalletApiProviders(base, {
    baseUrl: sphereWalletApiBaseUrl(),
    network: v2Network,
    deviceId,
  })

  return { providers, network: v2Network, deviceId, dataDir }
}

export function getUctDecimals() {
  const uct = TokenRegistry.getInstance().getDefinitionBySymbol('UCT')
  return Number(uct?.decimals ?? 8)
}

export function getUctCoinId() {
  return TokenRegistry.getInstance().getCoinIdBySymbol('UCT')
}

export async function initTreasurySphere({ mnemonic, autoGenerate = false } = {}) {
  const { providers, network, deviceId } = await createTreasuryProviders()

  const initOptions = {
    ...providers,
    network,
    ...(mnemonic ? { mnemonic } : autoGenerate ? { autoGenerate: true } : {}),
  }

  const { sphere } = await Sphere.init(initOptions)

  if (providers.ipfsTokenStorage) {
    await sphere.addTokenStorageProvider(providers.ipfsTokenStorage)
  }

  try {
    const outcome = await sphere.payments.resumeOpenIntents()
    const resumed = outcome?.resumed ?? outcome?.count ?? 0
    if (resumed) {
      console.log(`[sphere] resumed ${resumed} open payment intent(s)`)
    }
  } catch (e) {
    console.warn('[sphere] resumeOpenIntents failed:', e instanceof Error ? e.message : e)
  }

  console.log(`[sphere] wallet-api ready (network=${network}, deviceId=${deviceId})`)
  return sphere
}