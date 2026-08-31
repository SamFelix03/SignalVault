#!/usr/bin/env npx tsx
/**
 * 05 — Inspect a specific signal publish tx + nearby mirror/router events.
 *
 *   npx tsx scripts/binary-mirror/05-signal-tx.ts <signalTxHash> [vault] [follower]
 */
import 'dotenv/config'
import { decodeEventLog, parseAbiItem, type Address } from 'viem'
import {
  createClient,
  loadVaultBundle,
  parseArgs,
  printHeader,
  pass,
  fail,
  info,
} from './lib.js'

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

async function main() {
  const signalTx = process.argv[2] as `0x${string}`
  if (!signalTx) throw new Error('usage: 05-signal-tx.ts <signalTxHash> [vault] [follower]')

  const vault = (process.argv[3] ?? parseArgs().vault) as Address
  const follower = (process.argv[4] ?? parseArgs().follower) as Address
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)

  const receipt = await client.getTransactionReceipt({ hash: signalTx })
  const block = receipt.blockNumber
  const from = block > 100n ? block - 100n : 0n
  const to = block + 200n

  printHeader('05 — Signal tx inspection')
  info(`signalTx: ${signalTx}`)
  info(`block:    ${block}`)
  info(`status:   ${receipt.status}`)

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue
    try {
      const d = decodeEventLog({ abi: [signalUpdated], data: log.data, topics: log.topics })
      console.log('\nSignalUpdated:', {
        direction: d.args.direction,
        sizeBps: d.args.sizeBps,
        marketId: d.args.marketId,
        limitPrice: d.args.limitPrice?.toString(),
      })
    } catch {
      /* skip */
    }
  }

  const mirrorLogs = await client.getLogs({ address: b.mirror, fromBlock: from, toBlock: to })
  let foundMirror = false
  console.log('\n--- Mirror (±100 blocks) ---')
  for (const log of mirrorLogs) {
    try {
      const d = decodeEventLog({ abi: [mirrorExecuted], data: log.data, topics: log.topics })
      if (d.args.follower?.toLowerCase() !== follower.toLowerCase()) continue
      foundMirror = true
      pass(`MirrorExecuted tx=${log.transactionHash}`)
      console.log(d.args)
    } catch {
      /* skip */
    }
    try {
      const d = decodeEventLog({ abi: [mirrorFailed], data: log.data, topics: log.topics })
      if (d.args.follower?.toLowerCase() !== follower.toLowerCase()) continue
      foundMirror = true
      fail(`MirrorFailed tx=${log.transactionHash} reason=${d.args.reason}`)
    } catch {
      /* skip */
    }
  }
  if (!foundMirror) fail('No mirror events for follower near signal block')

  const routerLogs = await client.getLogs({ address: b.router, fromBlock: from, toBlock: to })
  let foundOrder = false
  console.log('\n--- Router OrderMirrored (±100 blocks) ---')
  for (const log of routerLogs) {
    try {
      const d = decodeEventLog({ abi: [orderMirrored], data: log.data, topics: log.topics })
      if (d.args.follower?.toLowerCase() !== follower.toLowerCase()) continue
      foundOrder = true
      pass(`OrderMirrored tx=${log.transactionHash}`)
      console.log(d.args)
    } catch {
      /* skip */
    }
  }
  if (!foundOrder) fail('No OrderMirrored — trade did not reach dreamDEX pool')

  process.exit(foundOrder ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
