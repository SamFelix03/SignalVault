/**
 * Trace USDso outflows from follower + mirror execution events.
 *   npx tsx scripts/trace-usdso-outflow.ts [follower]
 */
import 'dotenv/config'
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  type Address,
} from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = '0x535d863382aF5dbB94d078E28fFbdC42573F8F69' as Address
const USDso = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  opts: Parameters<typeof client.getLogs>[0],
  fromBlock: bigint,
  toBlock: bigint,
) {
  const chunk = 999n
  const all: Awaited<ReturnType<typeof client.getLogs>> = []
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n
    const logs = await client.getLogs({ ...opts, fromBlock: start, toBlock: end })
    all.push(...logs)
  }
  return all
}

async function main() {
  const follower = (process.argv[2] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)
  const mirrorReactor = await client.readContract({
    address: vault,
    abi: [{ type: 'function', name: 'mirrorReactor', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }],
    functionName: 'mirrorReactor',
  })

  const latest = await client.getBlockNumber()
  const fromBlock = latest > 100_000n ? latest - 100_000n : 0n

  const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
  const marginPulled = parseAbiItem('event MarginPulled(address indexed owner, uint256 amount)')
  const orderMirrored = parseAbiItem(
    'event OrderMirrored(address indexed follower, address indexed mirrorWallet, address indexed perpPool, int8 direction, uint256 marginBudget, uint256 quantity, uint128 orderId)',
  )
  const mirrorExecuted = parseAbiItem(
    'event MirrorExecuted(address indexed follower, int8 direction, uint256 collateral, bytes32 fillId, bytes32 marketId)',
  )
  const mirrorFailed = parseAbiItem('event MirrorFailed(address indexed follower, string reason)')
  const signalFee = parseAbiItem(
    'event SignalFeeCharged(address indexed follower, address indexed strategist, uint256 amount, bytes32 signalHash)',
  )

  const [outflows, marginPulls, orders, executed, failed, fees] = await Promise.all([
    getLogsChunked(client, { address: USDso, event: transfer, args: { from: follower } }, fromBlock, latest),
    getLogsChunked(client, { address: mirrorWallet, event: marginPulled }, fromBlock, latest),
    getLogsChunked(
      client,
      { address: perpRouter, event: orderMirrored, args: { follower } },
      fromBlock,
      latest,
    ),
    getLogsChunked(
      client,
      { address: mirrorReactor, event: mirrorExecuted, args: { follower } },
      fromBlock,
      latest,
    ),
    getLogsChunked(
      client,
      { address: mirrorReactor, event: mirrorFailed, args: { follower } },
      fromBlock,
      latest,
    ),
    getLogsChunked(client, { address: vault, event: signalFee, args: { follower } }, fromBlock, latest),
  ])

  const bal = await client.readContract({
    address: USDso,
    abi: [{ type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [follower],
  })

  console.log('=== Balances ===')
  console.log('follower USDso:', formatUnits(bal, 18))
  console.log('mirror wallet:', mirrorWallet)
  console.log({ perpRouter, mirrorReactor })

  console.log('\n=== USDso transfers FROM follower ===')
  let totalOut = 0n
  for (const l of outflows) {
    const v = l.args.value ?? 0n
    totalOut += v
    console.log({
      block: l.blockNumber?.toString(),
      tx: l.transactionHash,
      to: l.args.to,
      usdso: formatUnits(v, 18),
    })
  }
  console.log('Total out:', formatUnits(totalOut, 18), 'USDso')

  console.log('\n=== MarginPulled (mirror wallet) ===')
  for (const l of marginPulls) {
    console.log({
      block: l.blockNumber?.toString(),
      tx: l.transactionHash,
      owner: l.args.owner,
      amount: formatUnits(l.args.amount ?? 0n, 18),
    })
  }

  console.log('\n=== OrderMirrored ===')
  for (const l of orders) {
    console.log({
      block: l.blockNumber?.toString(),
      tx: l.transactionHash,
      pool: l.args.perpPool,
      direction: l.args.direction,
      margin: formatUnits(l.args.marginBudget ?? 0n, 18),
      qty: l.args.quantity?.toString(),
      orderId: l.args.orderId?.toString(),
    })
  }

  console.log('\n=== MirrorExecuted ===')
  for (const l of executed) {
    console.log({
      block: l.blockNumber?.toString(),
      tx: l.transactionHash,
      direction: l.args.direction,
      collateral: formatUnits(l.args.collateral ?? 0n, 6),
      fillId: l.args.fillId,
    })
  }

  console.log('\n=== MirrorFailed ===')
  for (const l of failed) {
    console.log({ block: l.blockNumber?.toString(), tx: l.transactionHash, reason: l.args.reason })
  }

  console.log('\n=== SignalFeeCharged (tUSDC, not USDso) ===')
  for (const l of fees) {
    console.log({
      block: l.blockNumber?.toString(),
      tx: l.transactionHash,
      amount: formatUnits(l.args.amount ?? 0n, 6),
      strategist: l.args.strategist,
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
