/**
 * Step 2: Probe pool.placeOrder directly from mirror wallet at ladder prices.
 * Identifies whether IOC fails at pool layer vs margin pull.
 *
 *   npx tsx scripts/probe-mirror-pool-order.ts <vault> [follower]
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address
const USDso = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address
const ORDER_TYPE_IOC = 2

function snapToTick(price: bigint, tickSize: bigint, roundUp: boolean): bigint {
  if (tickSize === 0n) tickSize = 1n
  const rem = price % tickSize
  if (rem === 0n) return price
  return roundUp ? price + (tickSize - rem) : price - rem
}

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)

  const pool = '0x996d36787cfc6569037039730d8cf82ad29c8f56' as Address
  const signal = await client.readContract({
    address: vault,
    abi: parseAbi([
      'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
    ]),
    functionName: 'getCurrentSignal',
  })
  const isBid = signal.direction > 0

  const poolAbi = parseAbi([
    'function getMarkPrice() view returns (uint256)',
    'function getOneBase() view returns (uint256)',
    'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    'function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) returns (bool success, uint128 id)',
  ])

  const [mark, oneBase, ob, followerBal, mirrorBal, marginDeposits] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getMarkPrice' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOneBase' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters' }),
    client.readContract({ address: USDso, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: USDso, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [mirrorWallet] }),
    client.readContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function getDepositedBalance(address account) view returns (uint256)']),
      functionName: 'getDepositedBalance',
      args: [mirrorWallet],
    }).catch(() => 0n),
  ])

  const [tickSize, minQuantity, lotSize] = ob
  const marginPull = 1_200_000_000_000_000_000n
  const leverage = 10n
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)

  console.log('=== Mirror wallet state ===')
  console.log({ mirrorWallet, perpRouter, follower })
  console.log('follower USDso:', (Number(followerBal) / 1e18).toFixed(4))
  console.log('mirror wallet USDso (EOA):', (Number(mirrorBal) / 1e18).toFixed(4))
  console.log('mirror margin bank deposit:', (Number(marginDeposits) / 1e18).toFixed(4))
  console.log({ mark: mark.toString(), tickSize: tickSize.toString(), minQuantity: minQuantity.toString(), lotSize: lotSize.toString() })

  const slippages = [200, 300, 600, 1200, 1500]
  console.log('\n=== Direct pool.placeOrder from mirror wallet (eth_call) ===')
  for (const bps of slippages) {
    const adj = (mark * BigInt(bps)) / 10_000n
    const rawPrice = isBid ? mark + adj : mark > adj ? mark - adj : mark
    const price = snapToTick(rawPrice, tickSize, isBid)
    const notional = marginPull * leverage
    const rawQty = (notional * oneBase) / price
    const quantity = rawQty >= lotSize ? (rawQty / lotSize) * lotSize : 0n

    try {
      const result = await client.simulateContract({
        address: pool,
        abi: poolAbi,
        functionName: 'placeOrder',
        args: [isBid, 0n, price, quantity, expireNs, ORDER_TYPE_IOC, 0, '0x0000000000000000000000000000000000000000', 0n],
        account: mirrorWallet,
      })
      console.log(` slippage=${bps}bps price=${price} qty=${quantity} → success=${result.result?.[0]} id=${result.result?.[1]}`)
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; cause?: { data?: Hex; reason?: string }; data?: Hex }
      console.log(` slippage=${bps}bps price=${price} qty=${quantity} → REVERT: ${err.shortMessage ?? err.cause?.reason}`)
      if (err.cause?.data) console.log('   data:', err.cause.data)
    }
  }

  // Probe executeOpen with marginPull=0 (margin already deposited)
  console.log('\n=== executeOpen with marginPull=0 (skip pull) ===')
  const walletAbi = parseAbi([
    'function executeOpen(address pool, uint256 marginPull, bool isBid, uint256 price, uint256 quantity, uint64 expireNs) returns (uint128 orderId)',
  ])
  const adj = (mark * 300n) / 10_000n
  const price300 = snapToTick(isBid ? mark + adj : mark - adj, tickSize, isBid)
  const qty300 = ((marginPull * leverage * oneBase) / price300 / lotSize) * lotSize

  try {
    const r = await client.simulateContract({
      address: mirrorWallet,
      abi: walletAbi,
      functionName: 'executeOpen',
      args: [pool, 0n, isBid, price300, qty300, expireNs],
      account: perpRouter,
    })
    console.log(' executeOpen(marginPull=0): orderId=', r.result?.toString())
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { reason?: string; data?: Hex } }
    console.log(' executeOpen(marginPull=0) REVERT:', err.shortMessage ?? err.cause?.reason, err.cause?.data ?? '')
  }

  try {
    const r = await client.simulateContract({
      address: mirrorWallet,
      abi: walletAbi,
      functionName: 'executeOpen',
      args: [pool, marginPull, isBid, price300, qty300, expireNs],
      account: perpRouter,
    })
    console.log(' executeOpen(marginPull=full): orderId=', r.result?.toString())
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; cause?: { reason?: string; data?: Hex } }
    console.log(' executeOpen(marginPull=full) REVERT:', err.shortMessage ?? err.cause?.reason)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
