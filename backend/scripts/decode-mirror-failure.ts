/**
 * Decode why MirrorFailed fired for a signal tx.
 *   npx tsx scripts/decode-mirror-failure.ts <signalTxHash> <vault> [follower]
 */
import 'dotenv/config'
import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  decodeEventLog,
  decodeErrorResult,
  type Address,
  type Hex,
} from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const signalTx = process.argv[2] as Hex
const vault = process.argv[3] as Address
const follower = (process.argv[4] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
const USDso = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address

const perpRouterErrors = [
  'error InvalidPrice()',
  'error ImmediateOrCancelNoFill()',
] as const

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const receipt = await client.getTransactionReceipt({ hash: signalTx })
  const block = receipt.blockNumber

  const mirrorReactor = await client.readContract({
    address: vault,
    abi: parseAbi(['function mirrorReactor() view returns (address)']),
    functionName: 'mirrorReactor',
  })
  const perpRouter = await client.readContract({
    address: vault,
    abi: parseAbi(['function eventRouter() view returns (address)']),
    functionName: 'eventRouter',
  })
  const reactorRouter = await client.readContract({
    address: mirrorReactor,
    abi: parseAbi(['function router() view returns (address)']),
    functionName: 'router',
  })
  const { mirrorWallet } = await resolveMirrorWallet(vault, follower)

  const [allowance, mirrorCode, routerVersion] = await Promise.all([
    client.readContract({
      address: USDso,
      abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
      functionName: 'allowance',
      args: [follower, mirrorWallet],
    }),
    client.getBytecode({ address: mirrorWallet }),
    client.readContract({
      address: perpRouter,
      abi: parseAbi(['function ROUTER_VERSION() view returns (uint256)']),
      functionName: 'ROUTER_VERSION',
    }).catch(() => 0n),
  ])

  console.log('=== Context ===')
  console.log({ signalTx, block: block.toString(), vault, follower })
  console.log({ mirrorReactor, perpRouter, reactorRouter, routerMatch: perpRouter.toLowerCase() === reactorRouter.toLowerCase(), routerVersion: routerVersion.toString(), mirrorWallet })
  console.log({
    mirrorDeployed: Boolean(mirrorCode && mirrorCode.length > 2),
    allowanceNow: allowance.toString(),
    approvedNow: allowance > 0n,
  })

  const failed = await client.getLogs({
    address: mirrorReactor,
    event: parseAbiItem('event MirrorFailed(address indexed follower, string reason)'),
    fromBlock: block,
    toBlock: block + 10n,
  })
  console.log('\n=== MirrorFailed events ===')
  for (const l of failed) {
    console.log(' block:', l.blockNumber.toString(), 'follower:', l.args.follower, 'reason:', JSON.stringify(l.args.reason))
  }

  const [signal, config] = await Promise.all([
    client.readContract({
      address: vault,
      abi: parseAbi([
        'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
      ]),
      functionName: 'getCurrentSignal',
    }),
    client.readContract({
      address: vault,
      abi: parseAbi([
        'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
      ]),
      functionName: 'getFollowerConfig',
      args: [follower],
    }),
  ])
  const collateral6 =
    (config.maxPositionSize * BigInt(signal.sizeBps) * BigInt(config.riskPct)) / (10_000n * 10_000n)

  async function simulateAt(label: string, router: Address, atBlock?: bigint) {
    console.log(`\n=== Simulate placeOrder ${label} ===`)
    console.log(' router:', router)
    try {
      const sim = await client.simulateContract({
        address: router,
        abi: parseAbi([
          'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 sizeAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32)',
        ]),
        functionName: 'placeOrder',
        args: [follower, signal.marketId, signal.direction, collateral6, signal.limitPrice, config.maxSlippageBps],
        account: mirrorReactor,
        ...(atBlock !== undefined ? { blockNumber: atBlock } : {}),
      })
      const fill = sim.result
      if (fill === undefined || fill === 0n) {
        console.log('⚠️ call succeeded but fillId is zero (IOC no-fill path)')
      } else {
        console.log('✅ fillId:', fill.toString())
      }
    } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { data?: Hex; reason?: string }; data?: Hex }
    const data = err.cause?.data ?? err.data
    console.log('❌', err.shortMessage ?? err.cause?.reason)
    if (data) {
      for (const sig of perpRouterErrors) {
        try {
          const d = decodeErrorResult({ abi: [parseAbiItem(sig)], data })
          console.log(' decoded:', d.errorName, d.args)
        } catch { /* next */ }
      }
      console.log(' revert data:', data)
    }
    }
  }

  await simulateAt('at signal block (vault router)', perpRouter, block)
  if (reactorRouter.toLowerCase() !== perpRouter.toLowerCase()) {
    await simulateAt('at signal block (reactor router — actual caller target)', reactorRouter, block)
  }
  await simulateAt('NOW', perpRouter)

  // Approval at signal block
  const allowanceAtSignal = await client.readContract({
    address: USDso,
    abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
    functionName: 'allowance',
    args: [follower, mirrorWallet],
    blockNumber: block,
  })
  console.log('\n=== Allowance at signal block ===')
  console.log('allowance:', allowanceAtSignal.toString(), allowanceAtSignal > 0n ? '(approved)' : '(NOT approved)')

  // Approval history: scan Approval events to mirror wallet (narrow window)
  console.log('\n=== USDso Approval events to mirror wallet ===')
  const approvals = await client.getLogs({
    address: USDso,
    event: parseAbiItem('event Approval(address indexed owner, address indexed spender, uint256 value)'),
    args: { owner: follower, spender: mirrorWallet },
    fromBlock: block > 50n ? block - 50n : 0n,
    toBlock: block + 50n,
  })
  if (approvals.length === 0) {
    console.log('No Approval events to this mirror wallet in last 500 blocks before signal+latest')
  }
  for (const a of approvals) {
    console.log(' block', a.blockNumber.toString(), 'value', a.args.value?.toString())
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
