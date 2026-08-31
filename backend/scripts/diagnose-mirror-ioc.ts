/**
 * Step 1: Reproduce mirror IOC pricing ladder vs live order book.
 *   npx tsx scripts/diagnose-mirror-ioc.ts <vault> [follower]
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address

const MIN_MIRROR_SLIPPAGE_BPS = 200
const MAX_MIRROR_SLIPPAGE_BPS = 1500
const MAX_FILL_ATTEMPTS = 6
const DEFAULT_LEVERAGE = 10

function snapToTick(price: bigint, tickSize: bigint, roundUp: boolean): bigint {
  if (tickSize === 0n) tickSize = 1n
  const rem = price % tickSize
  if (rem === 0n) return price
  return roundUp ? price + (tickSize - rem) : price - rem
}

function snapToLot(qty: bigint, lotSize: bigint): bigint {
  if (lotSize === 0n) lotSize = 1n
  if (qty < lotSize) return 0n
  return (qty / lotSize) * lotSize
}

function resolveMirrorPrice(mark: bigint, slippageBps: number, isBid: boolean, tickSize: bigint): bigint {
  const adj = (mark * BigInt(slippageBps)) / 10_000n
  const price = isBid ? mark + adj : mark > adj ? mark - adj : mark
  return snapToTick(price, tickSize, isBid)
}

function marginToQuantity(marginBudget: bigint, leverage: number, oneBase: bigint, price: bigint, lotSize: bigint): bigint {
  if (oneBase === 0n || price === 0n) return 0n
  const notional = marginBudget * BigInt(leverage)
  const rawQty = (notional * oneBase) / price
  return snapToLot(rawQty, lotSize)
}

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)

  const [signal, config, mirrorReactor] = await Promise.all([
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
    client.readContract({
      address: vault,
      abi: parseAbi(['function mirrorReactor() view returns (address)']),
      functionName: 'mirrorReactor',
    }),
  ])

  const pool = (`0x${signal.marketId.slice(-40)}`) as Address
  const poolAbi = parseAbi([
    'function getMarkPrice() view returns (uint256)',
    'function getOneBase() view returns (uint256)',
    'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
    'function marginBank() view returns (address)',
  ])
  const marginAbi = parseAbi([
    'function getMaxLeverage(address account, address perpPool) view returns (uint16)',
    'function getPosition(address account, address perpPool) view returns (int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs)',
  ])

  const collateral6 =
    (config.maxPositionSize * BigInt(signal.sizeBps) * BigInt(config.riskPct)) / (10_000n * 10_000n)
  const marginPull = collateral6 * 1_000_000_000_000n
  const isBid = signal.direction > 0
  const directionLabel = signal.direction > 0 ? 'LONG' : signal.direction < 0 ? 'SHORT' : 'FLAT'

  const [mark, oneBase, ob, lev, pos, mirrorCode] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getMarkPrice' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOneBase' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters' }),
    client.readContract({
      address: '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E',
      abi: marginAbi,
      functionName: 'getMaxLeverage',
      args: [mirrorWallet, pool],
    }),
    client.readContract({
      address: '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E',
      abi: marginAbi,
      functionName: 'getPosition',
      args: [mirrorWallet, pool],
    }),
    client.getBytecode({ address: mirrorWallet }),
  ])

  const leverage = lev > 0 ? lev : DEFAULT_LEVERAGE
  const [tickSize, minQuantity, lotSize] = ob

  console.log('=== Mirror IOC diagnosis ===')
  console.log({ vault, follower, mirrorWallet, perpRouter, mirrorReactor, pool })
  console.log({ direction: directionLabel, sizeBps: signal.sizeBps, maxSlippageBps: config.maxSlippageBps })
  console.log({
    marginPull18: marginPull.toString(),
    mirrorDeployed: Boolean(mirrorCode && mirrorCode.length > 2),
    mirrorLeverage: leverage,
    mirrorPositionSize: pos[0].toString(),
  })
  console.log({
    markPrice: mark.toString(),
    signalLimitPrice: signal.limitPrice.toString(),
    tickSize: tickSize.toString(),
    minQuantity: minQuantity.toString(),
    lotSize: lotSize.toString(),
    oneBase: oneBase.toString(),
  })

  // Order book via markets SDK
  const exchange = await createMarketsExchange()
  await exchange.loadMarkets(true)
  const markets = Object.values(exchange.markets)
  const perpMarket = markets.find(
    (m) => m.info && 'poolAddress' in m.info && (m.info.poolAddress as string).toLowerCase() === pool.toLowerCase(),
  )
  const symbol = perpMarket?.symbol ?? 'XRP/USDso:USDso'
  const book = await exchange.fetchOrderBook(symbol, 10)
  console.log('\n=== Order book (top 10) ===')
  console.log('Symbol:', symbol)
  console.log('Best bid:', book.bids[0] ?? 'none')
  console.log('Best ask:', book.asks[0] ?? 'none')
  console.log('Bid depth:', book.bids.length, 'Ask depth:', book.asks.length)

  let slippage = Math.max(config.maxSlippageBps, MIN_MIRROR_SLIPPAGE_BPS)
  console.log('\n=== PerpRouter retry ladder (off-chain mirror) ===')
  for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
    const price = resolveMirrorPrice(mark, slippage, isBid, tickSize)
    const quantity = marginToQuantity(marginPull, leverage, oneBase, price, lotSize)
    const bestBid = book.bids[0]?.[0]
    const bestAsk = book.asks[0]?.[0]
    const priceNum = Number(price) / 1e18
    let bookNote = ''
    if (!isBid && bestBid !== undefined) {
      bookNote = priceNum <= bestBid ? 'sell price <= best bid (should cross)' : `sell price > best bid ${bestBid} (may not fill)`
    }
    if (isBid && bestAsk !== undefined) {
      bookNote = priceNum >= bestAsk ? 'buy price >= best ask (should cross)' : `buy price < best ask ${bestAsk} (may not fill)`
    }
    if (book.bids.length === 0 && book.asks.length === 0) bookNote = 'EMPTY BOOK'

    console.log(
      ` attempt ${attempt}: slippage=${slippage}bps price=${price.toString()} (${priceNum.toFixed(6)}) qty=${quantity.toString()} ${quantity < minQuantity ? '← BELOW minQuantity' : ''} ${bookNote}`,
    )

    if (quantity > 0n) {
      try {
        await client.simulateContract({
          address: perpRouter,
          abi: parseAbi([
            'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 sizeAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32)',
          ]),
          functionName: 'placeOrder',
          args: [follower, signal.marketId, signal.direction, collateral6, signal.limitPrice, slippage],
          account: mirrorReactor,
        })
        console.log('   simulate placeOrder @ this slippage: call succeeded (may still return fillId=0)')
      } catch (e: unknown) {
        const err = e as { shortMessage?: string; cause?: { reason?: string } }
        console.log('   simulate placeOrder REVERT:', err.shortMessage ?? err.cause?.reason)
      }
    }

    if (slippage >= MAX_MIRROR_SLIPPAGE_BPS) break
    slippage = Math.min(slippage * 2, MAX_MIRROR_SLIPPAGE_BPS)
  }

  // Full placeOrder result
  try {
    const sim = await client.simulateContract({
      address: perpRouter,
      abi: parseAbi([
        'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 sizeAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32)',
      ]),
      functionName: 'placeOrder',
      args: [follower, signal.marketId, signal.direction, collateral6, signal.limitPrice, config.maxSlippageBps],
      account: mirrorReactor,
    })
    console.log('\n=== Full placeOrder simulation ===')
    console.log('fillId:', sim.result?.toString() ?? '0')
    console.log(sim.result === 0n || sim.result === undefined ? '→ MirrorReactor reports "order not filled"' : '→ would MirrorExecute')
  } catch (e: unknown) {
    const err = e as { shortMessage?: string }
    console.log('\nplaceOrder simulation REVERTED:', err.shortMessage)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
