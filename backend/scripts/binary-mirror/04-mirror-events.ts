#!/usr/bin/env npx tsx
/**
 * 04 — Mirror event history (MirrorExecuted / MirrorFailed).
 *
 *   npx tsx scripts/binary-mirror/04-mirror-events.ts [vault] [follower] [blocksBack]
 */
import 'dotenv/config'
import { parseAbiItem } from 'viem'
import {
  createClient,
  getLogsChunked,
  loadVaultBundle,
  parseArgs,
  printHeader,
  pass,
  fail,
  info,
} from './lib.js'

const mirrorExecuted = parseAbiItem(
  'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
)
const mirrorFailed = parseAbiItem('event MirrorFailed(address indexed follower, string reason)')
const orderMirrored = parseAbiItem(
  'event OrderMirrored(address indexed follower, bytes32 indexed marketId, int8 direction, uint256 collateralAmount, uint256 outcomeAmount, uint128 orderId)',
)

async function main() {
  const { vault, follower } = parseArgs()
  const blocksBack = Number(process.argv[4] ?? 5000)
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  const latest = await client.getBlockNumber()
  const from = latest > BigInt(blocksBack) ? latest - BigInt(blocksBack) : 0n

  printHeader(`04 — Mirror events (last ${blocksBack} blocks)`)

  const [executed, failed, orders] = await Promise.all([
    getLogsChunked(client, { address: b.mirror, event: mirrorExecuted, args: { follower } }, from, latest),
    getLogsChunked(client, { address: b.mirror, event: mirrorFailed, args: { follower } }, from, latest),
    getLogsChunked(client, { address: b.router, event: orderMirrored, args: { follower } }, from, latest),
  ])

  info(`mirror:  ${b.mirror}`)
  info(`router:  ${b.router}`)
  info(`range:   ${from} → ${latest}`)

  console.log('\n--- MirrorExecuted ---')
  if (executed.length === 0) fail('No MirrorExecuted events')
  else {
    pass(`${executed.length} MirrorExecuted`)
    for (const log of executed.slice(-10)) {
      console.log({
        block: log.blockNumber?.toString(),
        tx: log.transactionHash,
        direction: log.args.direction,
        collateral: log.args.collateral?.toString(),
        fillId: log.args.fillId,
      })
    }
  }

  console.log('\n--- MirrorFailed ---')
  if (failed.length === 0) info('No MirrorFailed events')
  else {
    fail(`${failed.length} MirrorFailed`)
    for (const log of failed.slice(-10)) {
      console.log({
        block: log.blockNumber?.toString(),
        tx: log.transactionHash,
        reason: log.args.reason,
      })
    }
  }

  console.log('\n--- OrderMirrored (router) ---')
  if (orders.length === 0) fail('No OrderMirrored events — dreamDEX order never succeeded')
  else {
    pass(`${orders.length} OrderMirrored`)
    for (const log of orders.slice(-10)) {
      console.log({
        block: log.blockNumber?.toString(),
        tx: log.transactionHash,
        marketId: log.args.marketId,
        collateral: log.args.collateralAmount?.toString(),
        outcome: log.args.outcomeAmount?.toString(),
        orderId: log.args.orderId?.toString(),
      })
    }
  }

  const success = executed.length > 0 || orders.length > 0
  console.log(success ? '\n→ At least one successful mirror found' : '\n→ No successful mirrors in range')
  process.exit(success ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
