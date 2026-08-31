#!/usr/bin/env npx tsx
/**
 * 10 — Decode all logs from a mirror reactor callback tx.
 *
 *   npx tsx scripts/binary-mirror/10-decode-mirror-tx.ts <mirrorTxHash>
 */
import 'dotenv/config'
import { decodeEventLog, parseAbiItem } from 'viem'
import { createClient, printHeader, info } from './lib.js'

const mirrorFailed = parseAbiItem('event MirrorFailed(address indexed follower, string reason)')
const mirrorExecuted = parseAbiItem(
  'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
)
const orderMirrored = parseAbiItem(
  'event OrderMirrored(address indexed follower, bytes32 indexed marketId, int8 direction, uint256 collateralAmount, uint256 outcomeAmount, uint128 orderId)',
)
const signalFee = parseAbiItem(
  'event SignalFeeCharged(address indexed follower, address indexed strategist, uint256 amount, bytes32 signalHash)',
)
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

async function main() {
  const hash = process.argv[2] as `0x${string}`
  if (!hash) throw new Error('usage: 10-decode-mirror-tx.ts <mirrorTxHash>')

  const client = createClient()
  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
  ])

  printHeader('10 — Decode mirror tx')
  info(`hash:     ${hash}`)
  info(`from:     ${tx.from}`)
  info(`to:       ${tx.to}`)
  info(`status:   ${receipt.status}`)
  info(`gasUsed:  ${receipt.gasUsed}`)
  info(`logs:     ${receipt.logs.length}`)

  console.log('\n--- Decoded events ---')
  for (const log of receipt.logs) {
    for (const [name, abi] of [
      ['MirrorFailed', mirrorFailed],
      ['MirrorExecuted', mirrorExecuted],
      ['SignalFeeCharged', signalFee],
      ['OrderMirrored', orderMirrored],
      ['Transfer', transfer],
    ] as const) {
      try {
        const d = decodeEventLog({ abi: [abi], data: log.data, topics: log.topics })
        console.log(`\n${name} @ ${log.address}`)
        console.log(d.args)
      } catch {
        /* not this event */
      }
    }
  }

  console.log('\n--- Interpretation ---')
  const hasFee = receipt.logs.some((l) => l.topics[0]?.startsWith('0xddf252ad')) // Transfer topic
  if (hasFee) info('Signal fee Transfer seen (follower → strategist)')
  info(`gas ~259k = failed early (often no router allowance)`)
  info(`gas ~745k = failed at pool order step (collateral pulled, order/fill failed)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
