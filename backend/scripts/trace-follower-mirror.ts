/**
 * Trace mirror execution for a follower on a vault.
 *   npx tsx scripts/trace-follower-mirror.ts <vault> <follower>
 */
import 'dotenv/config'
import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
  decodeEventLog,
} from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

const vaultAbi = parseAbi([
  'function mirrorReactor() view returns (address)',
  'function executionRouter() view returns (address)',
  'function instrumentType() view returns (uint8)',
  'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
])

const marginAbi = parseAbi([
  'function getPosition(address account, address perpPool) view returns (int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs)',
  'function getMaxLeverage(address account, address perpPool) view returns (uint16)',
])

const mirrorExecuted = parseAbiItem(
  'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
)
const mirrorFailed = parseAbiItem(
  'event MirrorFailed(address indexed follower, string reason)',
)
const orderMirrored = parseAbiItem(
  'event OrderMirrored(address indexed follower, address indexed perpPool, int8 direction, uint256 marginBudget, uint256 quantity, uint128 orderId)',
)
const signalUpdated = parseAbiItem(
  'event SignalUpdated(bytes32 indexed signalHash, int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, string reasoningSummary, bytes32 reasoningHash)',
)

async function main() {
  const vault = process.argv[2] as Address
  const follower = process.argv[3] as Address
  if (!vault || !follower) throw new Error('usage: trace-follower-mirror.ts <vault> <follower>')

  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const [mirror, router, instrument, signal, cfg] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'executionRouter' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'instrumentType' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowerConfig', args: [follower] }),
  ])

  const pool = (`0x${signal.marketId.slice(-40)}`) as Address
  const fromBlock = 476_000_000n

  console.log('=== Vault / follower ===')
  console.log({ vault, follower, instrument: instrument === 1 ? 'PERP' : 'BINARY', mirror, router })
  console.log('Follower config:', {
    active: cfg.active,
    riskPct: cfg.riskPct,
    maxPositionSize: cfg.maxPositionSize.toString(),
    maxSlippageBps: cfg.maxSlippageBps,
  })

  if (instrument === 1) {
    const [pos, lev] = await Promise.all([
      client.readContract({ address: MARGIN_BANK, abi: marginAbi, functionName: 'getPosition', args: [follower, pool] }),
      client.readContract({ address: MARGIN_BANK, abi: marginAbi, functionName: 'getMaxLeverage', args: [follower, pool] }),
    ])
    console.log('MarginBank position on signal pool:', { size: pos[0].toString(), avgEntry: pos[1].toString(), maxLeverage: lev })
  }

  console.log('\n=== Recent SignalUpdated (vault) ===')
  const signals = await client.getLogs({
    address: vault,
    event: signalUpdated,
    fromBlock,
    toBlock: 'latest',
  })
  for (const log of signals.slice(-5)) {
    console.log({
      block: log.blockNumber?.toString(),
      tx: log.transactionHash,
      direction: log.args.direction,
      sizeBps: log.args.sizeBps,
      marketId: log.args.marketId,
    })
  }

  console.log('\n=== MirrorExecuted / MirrorFailed (mirror reactor) ===')
  const [executed, failed] = await Promise.all([
    client.getLogs({
      address: mirror,
      event: mirrorExecuted,
      args: { follower },
      fromBlock,
      toBlock: 'latest',
    }),
    client.getLogs({
      address: mirror,
      event: mirrorFailed,
      args: { follower },
      fromBlock,
      toBlock: 'latest',
    }),
  ])

  if (executed.length === 0 && failed.length === 0) {
    console.log('No mirror events for this follower in scanned range.')
  }
  for (const log of executed) {
    console.log('EXECUTED', {
      block: log.blockNumber?.toString(),
      tx: log.transactionHash,
      direction: log.args.direction,
      collateral: log.args.collateral?.toString(),
      fillId: log.args.fillId,
      marketId: log.args.marketId,
    })
  }
  for (const log of failed) {
    console.log('FAILED', {
      block: log.blockNumber?.toString(),
      tx: log.transactionHash,
      reason: log.args.reason,
    })
  }

  if (instrument === 1) {
    console.log('\n=== OrderMirrored (PerpRouter) ===')
    const orders = await client.getLogs({
      address: router,
      event: orderMirrored,
      args: { follower },
      fromBlock,
      toBlock: 'latest',
    })
    if (orders.length === 0) console.log('No PerpRouter OrderMirrored events for follower.')
    for (const log of orders) {
      console.log({
        block: log.blockNumber?.toString(),
        tx: log.transactionHash,
        pool: log.args.perpPool,
        direction: log.args.direction,
        marginBudget: log.args.marginBudget?.toString(),
        quantity: log.args.quantity?.toString(),
        orderId: log.args.orderId?.toString(),
      })
    }
  }

  console.log('\n=== dreamDEX getUserFills (indexer) ===')
  try {
    const exchange = await createMarketsExchange()
    const fills = (await exchange.client.getUserFills(follower, { limit: 20 })) as Array<{
      id: string
      market: string
      pool?: string
      fillPrice: string
      timestamp: string
      takerIsBid?: boolean
    }>
    const recent = fills.slice(0, 10)
    if (recent.length === 0) console.log('No fills in indexer for follower.')
    for (const f of recent) {
      console.log({
        id: f.id,
        market: f.market,
        pool: f.pool,
        fillPrice: f.fillPrice,
        takerIsBid: f.takerIsBid,
        timestamp: f.timestamp,
      })
    }
  } catch (err) {
    console.log('getUserFills error:', err instanceof Error ? err.message : err)
  }

  console.log('\n=== Verdict ===')
  if (executed.length > 0 || (instrument === 1 && (await client.getLogs({ address: router, event: orderMirrored, args: { follower }, fromBlock, toBlock: 'latest' })).length > 0)) {
    console.log('On-chain mirror execution detected.')
  } else if (failed.length > 0) {
    console.log('Mirror attempted but FAILED — see reasons above.')
  } else if (signals.length > 0) {
    console.log('Signals published but no mirror tx for this follower (reactivity may not have fired, or follower was not subscribed at signal time).')
  } else {
    console.log('No signals or mirror activity found in range.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
