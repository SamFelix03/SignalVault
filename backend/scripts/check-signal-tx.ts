/**
 * Inspect a published signal tx and nearby mirror/router events.
 *   npx tsx scripts/check-signal-tx.ts <signalTxHash> [follower]
 */
import 'dotenv/config'
import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  decodeEventLog,
  type Address,
} from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const signalTx = process.argv[2] as `0x${string}`
const vaultArg = process.argv[3] as Address | undefined
const follower = (process.argv[4] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
if (!signalTx) throw new Error('usage: check-signal-tx.ts <signalTxHash> [vault] [follower]')

const signalUpdated = parseAbiItem(
  'event SignalUpdated(bytes32 indexed signalHash, int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, string reasoningSummary, bytes32 reasoningHash)',
)
const mirrorExecuted = parseAbiItem(
  'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
)
const mirrorFailed = parseAbiItem('event MirrorFailed(address indexed follower, string reason)')
const orderMirrored = parseAbiItem(
  'event OrderMirrored(address indexed follower, bytes32 indexed marketId, int8 direction, uint256 collateralAmount, uint256 outcomeAmount, uint128 orderId)',
)

const vaultAbi = parseAbi([
  'function mirrorReactor() view returns (address)',
  'function executionRouter() view returns (address)',
  'function getFollowers() view returns (address[])',
])

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const tx = await client.getTransaction({ hash: signalTx })
  const receipt = await client.getTransactionReceipt({ hash: signalTx })
  const vault = vaultArg ?? (() => {
    for (const log of receipt.logs) {
      try {
        decodeEventLog({ abi: [signalUpdated], data: log.data, topics: log.topics })
        return log.address as Address
      } catch {
        /* not signal event */
      }
    }
    throw new Error('Could not find SignalUpdated log — pass vault address as 2nd arg')
  })()
  const block = receipt.blockNumber
  const from = block > 100n ? block - 100n : 0n
  const to = block + 200n

  const [mirror, router, followers] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'executionRouter' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowers' }),
  ])

  console.log('=== Signal tx ===')
  console.log({
    hash: signalTx,
    vault,
    block: block.toString(),
    status: receipt.status,
    followers,
    mirror,
    router,
  })

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue
    try {
      const d = decodeEventLog({ abi: [signalUpdated], data: log.data, topics: log.topics })
      console.log('\nSignalUpdated:', {
        direction: d.args.direction,
        sizeBps: d.args.sizeBps,
        marketId: d.args.marketId,
        limitPrice: d.args.limitPrice?.toString(),
        summary: d.args.reasoningSummary?.slice(0, 100),
      })
    } catch {
      /* not signal event */
    }
  }

  console.log('\n=== Mirror events (±100 blocks) ===')
  const mirrorLogs = await client.getLogs({ address: mirror, fromBlock: from, toBlock: to })
  let foundMirror = false
  for (const log of mirrorLogs) {
  try {
      const d = decodeEventLog({ abi: [mirrorExecuted], data: log.data, topics: log.topics })
      if (d.args.follower?.toLowerCase() !== follower.toLowerCase()) continue
      foundMirror = true
      console.log('MirrorExecuted:', {
        tx: log.transactionHash,
        direction: d.args.direction,
        collateral: d.args.collateral?.toString(),
        fillId: d.args.fillId,
        marketId: d.args.marketId,
      })
    } catch {
      /* skip */
    }
    try {
      const d = decodeEventLog({ abi: [mirrorFailed], data: log.data, topics: log.topics })
      if (d.args.follower?.toLowerCase() !== follower.toLowerCase()) continue
      foundMirror = true
      console.log('MirrorFailed:', { tx: log.transactionHash, reason: d.args.reason })
    } catch {
      /* skip */
    }
  }
  if (!foundMirror) console.log('No mirror events for follower in window.')

  console.log('\n=== EventContractsRouter OrderMirrored (±100 blocks) ===')
  const routerLogs = await client.getLogs({ address: router, fromBlock: from, toBlock: to })
  let foundOrder = false
  for (const log of routerLogs) {
    try {
      const d = decodeEventLog({ abi: [orderMirrored], data: log.data, topics: log.topics })
      if (d.args.follower?.toLowerCase() !== follower.toLowerCase()) continue
      foundOrder = true
      console.log('OrderMirrored:', {
        tx: log.transactionHash,
        marketId: d.args.marketId,
        direction: d.args.direction,
        collateral: d.args.collateralAmount?.toString(),
        outcomeTokens: d.args.outcomeAmount?.toString(),
        orderId: d.args.orderId?.toString(),
      })
    } catch {
      /* skip */
    }
  }
  if (!foundOrder) console.log('No OrderMirrored events for follower in window.')

  const subId = await client.readContract({
    address: mirror,
    abi: parseAbi(['function subscriptionId() view returns (uint256)']),
    functionName: 'subscriptionId',
  })
  console.log('\nMirror subscriptionId:', subId.toString())
  if (subId === 0n) console.log('⚠ Mirror reactor has NO reactivity subscription — followers will not auto-trade.')

  console.log('\n=== Verdict ===')
  if (foundOrder) {
    console.log('✅ Trade executed on dreamDEX binary pool (OrderMirrored).')
  } else if (foundMirror) {
    console.log('Mirror fired but no successful binary order — check MirrorFailed reason.')
  } else if (followers.length === 0) {
    console.log('Signal published only — no followers subscribed, so no dreamDEX trade.')
  } else if (subId === 0n) {
    console.log('Signal published, followers exist, but mirror subscription missing.')
  } else {
    console.log('Signal published; mirror may not have fired yet or reactivity lagged.')
  }

  console.log('\n=== dreamDEX indexer (follower fills) ===')
  try {
    const { createMarketsExchange } = await import('../src/services/markets-exchange.js')
    const exchange = await createMarketsExchange()
    const fills = (await exchange.client.getUserFills(follower, { limit: 10 })) as Array<{
      id: string
      market: string
      fillPrice: string
      timestamp: string
      takerIsBid?: boolean
    }>
    if (fills.length === 0) {
      console.log('No fills returned for follower.')
    } else {
      for (const f of fills.slice(0, 5)) {
        console.log({ id: f.id, market: f.market, fillPrice: f.fillPrice, takerIsBid: f.takerIsBid, timestamp: f.timestamp })
      }
    }
  } catch (err) {
    console.log('Indexer unavailable:', err instanceof Error ? err.message : err)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
