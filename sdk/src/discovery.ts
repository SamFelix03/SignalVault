import { createPublicClient, http, type Hex } from 'viem'
import { snapToTickGrid } from './markets.js'

export interface LiveMarketPick {
  marketId: Hex
  asset: string
  upSymbol: string
  downSymbol: string
  bestAsk: number
  bestBid: number
  bestNoAsk: number
  /** YES limit (raw) for BUY_YES — from YES ask + buffer */
  suggestedLimitPriceUp: bigint
  /** NO limit (raw) for BUY_NO — from NO ask + buffer (dreamDEX uses outcome-native price) */
  suggestedLimitPriceDown: bigint
  /** @deprecated use suggestedLimitPriceUp / Down */
  suggestedLimitPrice: bigint
  secondsToExpiry: number
}

export interface PickLiveMarketOptions {
  asset?: string
  minSecondsLeft?: number
  indexerUrl: string
  wsRpcUrl?: string
  rpcUrl: string
  privateKey?: string
  collateralDecimals?: number
}

export async function pickLiveMarket(opts: PickLiveMarketOptions): Promise<LiveMarketPick | null> {
  let SomniaMarkets: typeof import('@somnia-chain/markets-sdk').SomniaMarkets
  let isBinaryMarket: typeof import('@somnia-chain/markets-sdk').isBinaryMarket
  let SOMNIA_TESTNET_ADDRESSES: typeof import('@somnia-chain/markets-sdk').SOMNIA_TESTNET_ADDRESSES
  let somniaShannon: typeof import('@somnia-chain/markets-sdk/chains').somniaShannon

  try {
    const mod = await import('@somnia-chain/markets-sdk')
    const chains = await import('@somnia-chain/markets-sdk/chains')
    SomniaMarkets = mod.SomniaMarkets
    isBinaryMarket = mod.isBinaryMarket
    SOMNIA_TESTNET_ADDRESSES = mod.SOMNIA_TESTNET_ADDRESSES
    somniaShannon = chains.somniaShannon
  } catch {
    throw new Error(
      'pickLiveMarket requires @somnia-chain/markets-sdk >= 0.28.0. Install it: npm install @somnia-chain/markets-sdk',
    )
  }

  const asset = opts.asset ?? 'ETH'
  const minLeft = opts.minSecondsLeft ?? 300
  const dec = opts.collateralDecimals ?? 6

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

  const rows = await exchange.client.listLiveBinaryMarkets({ limit: 50 })
  const now = Date.now() / 1000

  for (const row of rows) {
    if (row.asset !== asset) continue
    const secondsLeft = Number(row.expiry) - now
    if (secondsLeft < minLeft) continue

    const marketId = row.marketId as Hex
    const onchain = await exchange.client.getMarketOnchain(marketId)
    if (onchain.status !== 1) continue

    const markets = await exchange.loadMarkets(true)
    const entry = Object.values(markets).find(m => {
      return m.active && isBinaryMarket(m.info) && m.info.marketId === marketId
    })
    if (!entry || !isBinaryMarket(entry.info)) continue

    const upSymbol = entry.outcomes?.[0]?.symbol
    const downSymbol = entry.outcomes?.[1]?.symbol
    if (!upSymbol || !downSymbol) continue

    const yesBook = await exchange.fetchOrderBook(upSymbol, 5)
    const noBook = await exchange.fetchOrderBook(downSymbol, 5)
    const ask = yesBook.asks[0]?.[0]
    const bid = yesBook.bids[0]?.[0]
    const noAsk = noBook.asks[0]?.[0]
    if (ask === undefined || bid === undefined || noAsk === undefined) continue

    const suggestedLimitPriceUp = snapToTickGrid(Math.min(1, ask + 0.02), dec)
    const suggestedLimitPriceDown = snapToTickGrid(Math.min(1, noAsk + 0.02), dec)

    return {
      marketId,
      asset,
      upSymbol,
      downSymbol,
      bestAsk: ask,
      bestBid: bid,
      bestNoAsk: noAsk,
      suggestedLimitPriceUp,
      suggestedLimitPriceDown,
      suggestedLimitPrice: suggestedLimitPriceUp,
      secondsToExpiry: secondsLeft,
    }
  }

  return null
}

export async function createMarketsPublicClient(rpcUrl: string, chainId = 50312) {
  return createPublicClient({
    chain: {
      id: chainId,
      name: 'Somnia Testnet',
      nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  })
}
