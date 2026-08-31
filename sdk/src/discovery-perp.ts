import type { Address, Hex } from 'viem'
import type { SomniaMarkets } from '@somnia-chain/markets-sdk'
import { isPerpMarket } from '@somnia-chain/markets-sdk'

export interface LivePerpMarketPick {
  symbol: string
  pool: Address
  markPrice: number
  minLot: number
  quoteDecimals: number
  suggestedLimitPrice: bigint
}

export interface PickLivePerpMarketOptions {
  asset?: string
  preferLowNotional?: boolean
}

export interface PickLivePerpMarketFromIndexerOptions extends PickLivePerpMarketOptions {
  indexerUrl: string
  wsRpcUrl?: string
  rpcUrl: string
  privateKey?: string
}

/** Pick an active perp pool for signal publishing (prefers XRP/ADA for small testnet margin). */
export async function pickLivePerpMarket(
  exchange: SomniaMarkets,
  opts: PickLivePerpMarketOptions = {},
): Promise<LivePerpMarketPick> {
  const pick = await pickLivePerpMarketInternal(exchange, opts)
  return {
    ...pick,
    suggestedLimitPrice: encodePerpLimitPrice(pick.markPrice * 1.01, pick.quoteDecimals),
  }
}

/** Standalone perp discovery (mirrors pickLiveMarket options). */
export async function pickLivePerpMarketFromIndexer(
  opts: PickLivePerpMarketFromIndexerOptions,
): Promise<LivePerpMarketPick> {
  let SomniaMarkets: typeof import('@somnia-chain/markets-sdk').SomniaMarkets
  let SOMNIA_TESTNET_ADDRESSES: typeof import('@somnia-chain/markets-sdk').SOMNIA_TESTNET_ADDRESSES
  let somniaShannon: typeof import('@somnia-chain/markets-sdk/chains').somniaShannon

  try {
    const mod = await import('@somnia-chain/markets-sdk')
    const chains = await import('@somnia-chain/markets-sdk/chains')
    SomniaMarkets = mod.SomniaMarkets
    SOMNIA_TESTNET_ADDRESSES = mod.SOMNIA_TESTNET_ADDRESSES
    somniaShannon = chains.somniaShannon
  } catch {
    throw new Error(
      'pickLivePerpMarketFromIndexer requires @somnia-chain/markets-sdk >= 0.28.0. Install it: npm install @somnia-chain/markets-sdk',
    )
  }

  const wsRpcUrl =
    opts.wsRpcUrl ??
    opts.rpcUrl.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws'

  const exchange = new SomniaMarkets({
    indexerUrl: opts.indexerUrl,
    chain: somniaShannon,
    wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    ...(opts.privateKey ? { privateKey: opts.privateKey as Hex } : {}),
  } as ConstructorParameters<typeof SomniaMarkets>[0])

  return pickLivePerpMarket(exchange, opts)
}

async function pickLivePerpMarketInternal(
  exchange: SomniaMarkets,
  opts: PickLivePerpMarketOptions = {},
): Promise<Omit<LivePerpMarketPick, 'suggestedLimitPrice'>> {
  const markets = Object.values(await exchange.loadMarkets(true)).filter(
    (m) => m.active && isPerpMarket(m.info),
  )
  if (markets.length === 0) throw new Error('No active perp markets')

  const asset = opts.asset?.toUpperCase()
  let candidates = markets
  if (asset) {
    candidates = markets.filter((m) => m.symbol.toUpperCase().startsWith(`${asset}/`))
  }
  if (opts.preferLowNotional) {
    const low = candidates.find((m) => m.symbol.startsWith('XRP/') || m.symbol.startsWith('ADA/'))
    if (low) candidates = [low, ...candidates.filter((m) => m !== low)]
  }

  const target = candidates[0] ?? markets[0]
  const book = await exchange.fetchOrderBook(target.symbol, 3)
  const markPrice = book.asks[0]?.[0] ?? book.bids[0]?.[0]
  if (markPrice == null) throw new Error(`No order book for ${target.symbol}`)

  const minLot =
    target.symbol.startsWith('XRP/') || target.symbol.startsWith('ADA/') ? 1 : 0.01

  return {
    symbol: target.symbol,
    pool: target.info.poolAddress as Address,
    markPrice,
    minLot,
    quoteDecimals: target.info.quoteDecimals ?? 18,
  }
}

export function encodePerpPoolRef(pool: Address): Hex {
  const addr = pool.toLowerCase().replace('0x', '')
  return `0x${addr.padStart(64, '0')}` as Hex
}

export function encodePerpLimitPrice(human: number, quoteDecimals: number, tickSize = 1e-3): bigint {
  const raw = BigInt(Math.round(human * 10 ** quoteDecimals))
  const tick = BigInt(Math.round(tickSize * 10 ** quoteDecimals))
  if (tick <= 0n) return raw
  return (raw / tick) * tick
}

/** Direction-aware limit for signal publishing (SHORT uses mark − buffer, LONG mark + buffer). */
export function encodePerpLimitPriceForDirection(
  direction: 'LONG' | 'SHORT' | 'FLAT' | number,
  markPrice: number,
  quoteDecimals: number,
  tickSize = 1e-3,
  bufferBps = 200,
): bigint {
  const isLong = typeof direction === 'number' ? direction > 0 : direction === 'LONG'
  const isShort = typeof direction === 'number' ? direction < 0 : direction === 'SHORT'
  const mult = isLong ? 1 + bufferBps / 10_000 : isShort ? 1 - bufferBps / 10_000 : 1
  return encodePerpLimitPrice(markPrice * mult, quoteDecimals, tickSize)
}
