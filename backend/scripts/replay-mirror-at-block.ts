/**
 * Replay mirror placeOrder at historical block vs pool IOC attempts.
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, formatUnits, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

const vault = '0x535d863382aF5dbB94d078E28fFbdC42573F8F69' as Address
const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as Address
const signalBlock = 476194331n
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
  const mirrorReactor = await client.readContract({
    address: vault,
    abi: parseAbi(['function mirrorReactor() view returns (address)']),
    functionName: 'mirrorReactor',
  })

  const [signal, config] = await Promise.all([
    client.readContract({
      address: vault,
      abi: parseAbi([
        'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
      ]),
      functionName: 'getCurrentSignal',
      blockNumber: signalBlock,
    }),
    client.readContract({
      address: vault,
      abi: parseAbi([
        'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
      ]),
      functionName: 'getFollowerConfig',
      args: [follower],
      blockNumber: signalBlock,
    }),
  ])

  const pool = (`0x${signal.marketId.slice(-40)}`) as Address
  const collateral6 =
    (config.maxPositionSize * BigInt(signal.sizeBps) * BigInt(config.riskPct)) / (10_000n * 10_000n)
  const marginPull = collateral6 * 1_000_000_000_000n
  const isBid = signal.direction > 0

  const poolAbi = parseAbi([
    'function getMarkPrice() view returns (uint256)',
    'function getOneBase() view returns (uint256)',
    'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    'function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) returns (bool success, uint128 id)',
  ])

  const [mark, oneBase, ob, lev] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getMarkPrice', blockNumber: signalBlock }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOneBase', blockNumber: signalBlock }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters', blockNumber: signalBlock }),
    client.readContract({
      address: '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E',
      abi: parseAbi(['function getMaxLeverage(address,address) view returns (uint16)']),
      functionName: 'getMaxLeverage',
      args: [mirrorWallet, pool],
      blockNumber: signalBlock,
    }),
  ])

  const [tickSize, minQuantity, lotSize] = ob
  const leverage = lev > 0 ? BigInt(lev) : 10n
  const expireNs = BigInt((476194331n * 1n + 300n) * 1_000_000_000n) // rough

  console.log('=== At signal block', signalBlock.toString(), '===')
  console.log({
    direction: isBid ? 'LONG' : 'SHORT',
    marginPull: formatUnits(marginPull, 18),
    mark: formatUnits(mark, 18),
    leverage: leverage.toString(),
    minQuantity: minQuantity.toString(),
    lotSize: lotSize.toString(),
  })

  const slippages = [200, 300, 600, 1200, 1500]
  console.log('\n=== Pool IOC from mirror wallet @ signal block (no prior fund in call) ===')
  for (const bps of slippages) {
    const adj = (mark * BigInt(bps)) / 10_000n
    const raw = isBid ? mark + adj : mark > adj ? mark - adj : mark
    const price = snapToTick(raw, tickSize, isBid)
    const qty = ((marginPull * leverage * oneBase) / price / lotSize) * lotSize
    try {
      const r = await client.simulateContract({
        address: pool,
        abi: poolAbi,
        functionName: 'placeOrder',
        args: [isBid, 0n, price, qty, expireNs, ORDER_TYPE_IOC, 0, '0x0000000000000000000000000000000000000000', 0n],
        account: mirrorWallet,
        blockNumber: signalBlock,
      })
      console.log(` bps=${bps} price=${price} qty=${qty} → success=${r.result?.[0]} id=${r.result?.[1]?.toString()}`)
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; cause?: { data?: string } }
      console.log(` bps=${bps} price=${price} qty=${qty} → REVERT ${err.shortMessage} ${err.cause?.data ?? ''}`)
    }
  }

  console.log('\n=== Full router placeOrder @ signal block ===')
  const sim = await client.simulateContract({
    address: perpRouter,
    abi: parseAbi([
      'function placeOrder(address,bytes32,int8,uint256,uint256,uint16) returns (bytes32)',
    ]),
    functionName: 'placeOrder',
    args: [follower, signal.marketId, signal.direction, collateral6, signal.limitPrice, config.maxSlippageBps],
    account: mirrorReactor,
    blockNumber: signalBlock,
  })
  const fill = sim.result
  const fillBig = typeof fill === 'string' ? BigInt(fill) : (fill ?? 0n)
  console.log('fillId raw:', fill)
  console.log('fillId zero?', fillBig === 0n)

  const exchange = await createMarketsExchange()
  await exchange.loadMarkets(true)
  const perpMarket = Object.values(exchange.markets).find(
    (m) => m.info && 'poolAddress' in m.info && (m.info.poolAddress as string).toLowerCase() === pool.toLowerCase(),
  )
  if (perpMarket) {
    const book = await exchange.fetchOrderBook(perpMarket.symbol, 10)
    console.log('\n=== Indexer order book (current, not historical) ===')
    console.log('best bid', book.bids[0], 'best ask', book.asks[0])
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
