/**
 * Shared helpers for binary mirror isolation scripts.
 */
import {
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL, TESTNET_TUSDC, BINARY_MARKETS_MODULE } from '../../src/config/constants.js'

export const DEFAULT_VAULT = '0xd97cBa8979EAA4b1eE6661Ab64b70a5d88E68Eb8' as Address
export const DEFAULT_FOLLOWER = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as Address

export const vaultAbi = parseAbi([
  'function mirrorReactor() view returns (address)',
  'function eventRouter() view returns (address)',
  'function instrumentType() view returns (uint8)',
  'function signalPrice() view returns (uint256)',
  'function paymentToken() view returns (address)',
  'function strategist() view returns (address)',
  'function getFollowers() view returns (address[])',
  'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
  'function paymentAuthorized(address) view returns (bool)',
])

export const mirrorAbi = parseAbi([
  'function subscriptionId() view returns (uint256)',
  'function router() view returns (address)',
  'function totalMirrored() view returns (uint256)',
  'function vault() view returns (address)',
])

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

export const marketsAbi = parseAbi([
  'function markets(bytes32) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)',
])

export const marketAbi = parseAbi(['function status() view returns (uint8)', 'function outcomeToken() view returns (address)'])

export const poolAbi = parseAbi([
  'function getBinaryPoolParams() view returns (address collateralToken, address market, address outcomeToken, uint256 yesId, uint256 noId, uint256 oneCollateral, uint256 setBacking, address feeRecipient, uint256 makerFeeBpsTimes1k, uint256 takerFeeBpsTimes1k, uint256 maxBuilderFeeBpsTimes1k, uint256 settlementFeeBpsTimes1k, address settlement, uint64 marketNonce, bool finalized)',
])

export const routerAbi = parseAbi([
  'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 collateralAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32 fillId)',
  'function mirrorReactor() view returns (address)',
  'function collateralToken() view returns (address)',
])

export function parseArgs() {
  const vault = (process.argv[2] ?? DEFAULT_VAULT) as Address
  const follower = (process.argv[3] ?? DEFAULT_FOLLOWER) as Address
  return { vault, follower }
}

export function requireVaultArg(): Address {
  const vault = process.argv[2] as Address
  if (!vault) throw new Error('usage: script <vault> [follower]')
  return vault
}

export function createClient(): PublicClient {
  return createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
}

export async function loadVaultBundle(client: PublicClient, vault: Address, follower: Address) {
  const [mirror, router, instrument, signalPrice, paymentToken, followers, signal, cfg, paymentOk, strategist] =
    await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'eventRouter' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'instrumentType' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'signalPrice' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'paymentToken' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowers' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowerConfig', args: [follower] }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'paymentAuthorized', args: [follower] }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'strategist' }),
    ])

  const [mirrorRouter, subId, totalMirrored, mirrorVault] = await Promise.all([
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'router' }),
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'subscriptionId' }),
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'totalMirrored' }),
    client.readContract({ address: mirror, abi: mirrorAbi, functionName: 'vault' }),
  ])

  const collateral =
    signal.direction === 0
      ? 0n
      : (cfg.maxPositionSize * BigInt(signal.sizeBps) * BigInt(cfg.riskPct)) / (10_000n * 10_000n)

  return {
    vault,
    follower,
    mirror,
    router,
    instrument,
    signalPrice,
    paymentToken,
    followers,
    signal,
    cfg,
    paymentOk,
    strategist,
    mirrorRouter,
    subId,
    totalMirrored,
    mirrorVault,
    collateral,
  }
}

export function collateralForSignal(
  maxPositionSize: bigint,
  sizeBps: number,
  riskPct: number,
): bigint {
  return (maxPositionSize * BigInt(sizeBps) * BigInt(riskPct)) / (10_000n * 10_000n)
}

export function applySlippage(price: bigint, slippageBps: number, _isBuyYes?: boolean): bigint {
  if (slippageBps === 0) return price
  const adj = (price * BigInt(slippageBps)) / 10_000n
  return price + adj
}

/** Outcome-native price: qty = collateral * scale / price (matches fixed router). */
export function qtyBuyNo(collateral: bigint, price: bigint, oneCollateral: bigint, lot = 1_000n): bigint {
  if (price === 0n) return 0n
  const raw = (collateral * oneCollateral) / price
  return snapLot(raw, lot)
}

export function snapLot(raw: bigint, lot: bigint): bigint {
  if (raw < lot) return 0n
  return (raw / lot) * lot
}

export function decodeLimitHuman(raw: bigint, decimals = 6): string {
  return `${(Number(raw) / 10 ** decimals * 100).toFixed(2)}% YES`
}

export function maxNoPayHuman(yesLimitRaw: bigint, decimals = 6): string {
  const yes = Number(yesLimitRaw) / 10 ** decimals
  return `${((1 - yes) * 100).toFixed(2)}% NO max`
}

export async function loadMarketForSignal(client: PublicClient, marketId: `0x${string}`) {
  const row = await client.readContract({
    address: BINARY_MARKETS_MODULE,
    abi: marketsAbi,
    functionName: 'markets',
    args: [marketId],
  })
  const marketAddr = row[8]
  const pool = row[9]
  const [status, poolParams] = await Promise.all([
    client.readContract({ address: marketAddr, abi: marketAbi, functionName: 'status' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getBinaryPoolParams' }),
  ])
  const now = BigInt(Math.floor(Date.now() / 1000))
  return {
    marketId,
    marketAddr,
    pool,
    collateral: row[3],
    yesId: row[10],
    noId: row[11],
    expiry: row[13],
    secondsLeft: row[13] - now,
    status,
    statusLabel: status === 1 ? 'TRADING' : `status=${status}`,
    oneCollateral: poolParams[5],
    outcomeToken: poolParams[2],
  }
}

export async function getTusdcDecimals(client: PublicClient): Promise<number> {
  return client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'decimals' })
}

export async function formatTusdc(client: PublicClient, amount: bigint): Promise<string> {
  const dec = await getTusdcDecimals(client)
  return formatUnits(amount, dec)
}

export async function getLogsChunked(
  client: PublicClient,
  params: Parameters<PublicClient['getLogs']>[0],
  fromBlock: bigint,
  toBlock: bigint,
) {
  const chunk = 900n
  const all: Awaited<ReturnType<PublicClient['getLogs']>> = []
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n
    const logs = await client.getLogs({ ...params, fromBlock: start, toBlock: end })
    all.push(...logs)
  }
  return all
}

export function printHeader(title: string) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`)
}

export function pass(msg: string) {
  console.log(`✅ ${msg}`)
}

export function fail(msg: string) {
  console.log(`❌ ${msg}`)
}

export function warn(msg: string) {
  console.log(`⚠️  ${msg}`)
}

export function info(msg: string) {
  console.log(`   ${msg}`)
}
