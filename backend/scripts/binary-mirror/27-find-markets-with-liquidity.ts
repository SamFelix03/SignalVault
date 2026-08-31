#!/usr/bin/env npx tsx
import 'dotenv/config'

async function main() {
  console.log('=== SEARCHING FOR MARKETS WITH LIQUIDITY ===\n')
  
  const INDEXER_URL = process.env.MARKETS_INDEXER_URL!
  const RPC_URL = process.env.RPC_URL!
  const WS_RPC_URL = process.env.WS_RPC_URL!
  
  const { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } = await import('@somnia-chain/markets-sdk')
  const { somniaShannon } = await import('@somnia-chain/markets-sdk/chains')
  
  const exchange = new SomniaMarkets({
    indexerUrl: INDEXER_URL,
    chain: somniaShannon,
    wsRpcUrl: WS_RPC_URL,
    addresses: SOMNIA_TESTNET_ADDRESSES,
  })
  
  console.log('📡 Fetching live markets...')
  const markets = await exchange.client.listLiveBinaryMarkets({ limit: 50 })
  console.log(`Found ${markets.length} live markets\n`)
  
  const now = Date.now() / 1000
  const marketsWithLiquidity = []
  
  for (const market of markets) {
    const secondsLeft = Number(market.expiry) - now
    if (secondsLeft < 60) continue // Skip markets expiring in < 1 minute
    
    try {
      // Load full market data
      const allMarkets = await exchange.loadMarkets(true)
      const entry = Object.values(allMarkets).find((m: any) => 
        m.active && m.info?.marketId === market.marketId
      ) as any
      
      if (!entry?.outcomes?.[0]) continue
      
      const yesSymbol = entry.outcomes[0].symbol
      const noSymbol = entry.outcomes[1].symbol
      
      // Fetch order books
      const [yesBook, noBook] = await Promise.all([
        exchange.fetchOrderBook(yesSymbol, 5),
        exchange.fetchOrderBook(noSymbol, 5)
      ])
      
      const hasLiquidity = (
        (yesBook.asks?.length > 0 || yesBook.bids?.length > 0) ||
        (noBook.asks?.length > 0 || noBook.bids?.length > 0)
      )
      
      if (hasLiquidity) {
        const minutesLeft = Math.floor(secondsLeft / 60)
        marketsWithLiquidity.push({
          marketId: market.marketId,
          asset: market.asset,
          yesSymbol,
          noSymbol,
          minutesLeft,
          yesBook,
          noBook
        })
        
        console.log(`✅ ${market.asset} - ${yesSymbol}`)
        console.log(`   Market ID: ${market.marketId}`)
        console.log(`   Time left: ${minutesLeft} minutes`)
        console.log(`   YES - Asks: ${yesBook.asks?.length || 0}, Bids: ${yesBook.bids?.length || 0}`)
        console.log(`   NO  - Asks: ${noBook.asks?.length || 0}, Bids: ${noBook.bids?.length || 0}`)
        
        if (yesBook.asks?.[0]) console.log(`   Best YES ask: ${yesBook.asks[0][0]}`)
        if (noBook.asks?.[0]) console.log(`   Best NO ask: ${noBook.asks[0][0]}`)
        console.log()
      }
    } catch (e: any) {
      // Skip markets with errors
      continue
    }
  }
  
  console.log(`\n📊 Found ${marketsWithLiquidity.length} markets with liquidity`)
  
  if (marketsWithLiquidity.length > 0) {
    console.log('\n🎯 BEST MARKET FOR TESTING:')
    const best = marketsWithLiquidity[0]
    console.log(`   Market ID: ${best.marketId}`)
    console.log(`   Asset: ${best.asset}`)
    console.log(`   Time left: ${best.minutesLeft} minutes`)
    console.log(`   Use this market to test mirroring!`)
  } else {
    console.log('\n⚠️  No markets with liquidity found. Markets may be too new.')
  }
}

main().catch(console.error)
