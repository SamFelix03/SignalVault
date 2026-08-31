#!/usr/bin/env npx tsx
import 'dotenv/config'

async function main() {
  console.log('=== TESTING MARKETS SDK DIRECTLY ===')
  
  const INDEXER_URL = process.env.MARKETS_INDEXER_URL!
  const RPC_URL = process.env.RPC_URL!
  const WS_RPC_URL = process.env.WS_RPC_URL!
  
  console.log('Indexer:', INDEXER_URL)
  console.log('RPC:', RPC_URL)
  
  try {
    const { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } = await import('@somnia-chain/markets-sdk')
    const { somniaShannon } = await import('@somnia-chain/markets-sdk/chains')
    
    console.log('\n✅ Markets SDK loaded')
    
    const exchange = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
    })
    
    console.log('\n📡 Fetching live binary markets...')
    const markets = await exchange.client.listLiveBinaryMarkets({ limit: 50 })
    
    console.log(`\n✅ Found ${markets.length} markets in indexer\n`)
    
    const now = Date.now() / 1000
    
    for (const market of markets.slice(0, 10)) {
      const secondsLeft = Number(market.expiry) - now
      const minutesLeft = Math.floor(secondsLeft / 60)
      
      console.log(`${market.asset} - ${market.symbol}`)
      console.log(`  Market ID: ${market.marketId}`)
      console.log(`  Expiry: ${new Date(Number(market.expiry) * 1000).toISOString()}`)
      console.log(`  Time left: ${minutesLeft} min (${secondsLeft}s)`)
      console.log(`  Status: ${secondsLeft > 0 ? '✅ ACTIVE' : '❌ EXPIRED'}`)
      console.log()
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

main().catch(console.error)
