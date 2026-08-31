/**
 * Decode logs from a mirror reactor callback tx.
 *   npx tsx scripts/decode-mirror-tx.ts <mirrorTxHash>
 */
import 'dotenv/config'
import { createPublicClient, http, decodeEventLog, parseAbiItem } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const hash = process.argv[2] as `0x${string}`
if (!hash) throw new Error('usage: decode-mirror-tx.ts <txHash>')

const mirrorFailed = parseAbiItem('event MirrorFailed(address indexed follower, string reason)')
const mirrorExecuted = parseAbiItem(
  'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
)
const signalFee = parseAbiItem(
  'event SignalFeeCharged(address indexed follower, address indexed strategist, uint256 amount, bytes32 signalHash)',
)
const orderMirrored = parseAbiItem(
  'event OrderMirrored(address indexed follower, bytes32 indexed marketId, int8 direction, uint256 collateralAmount, uint256 outcomeAmount, uint128 orderId)',
)
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const receipt = await client.getTransactionReceipt({ hash })
  const tx = await client.getTransaction({ hash })
  console.log({
    hash,
    from: tx.from,
    to: tx.to,
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    logs: receipt.logs.length,
  })

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
        console.log(name, log.address, d.args)
      } catch {
        /* skip */
      }
    }
  }
}

main().catch(console.error)
