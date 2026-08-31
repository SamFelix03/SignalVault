#!/usr/bin/env npx tsx
import 'dotenv/config'

const INDEXER_URL = 'https://dev.smk.somnia.host/v1/graphql'

async function main() {
  console.log('=== QUERYING GRAPHQL MARKETS INDEXER ===')
  console.log('URL:', INDEXER_URL)
  
  // Query for active binary markets
  const query = `
    query GetActiveMarkets {
      binary_markets(
        where: {
          status: {_eq: 1}
          expiry: {_gt: "${Math.floor(Date.now() / 1000)}"}
        }
        order_by: {expiry: asc}
        limit: 10
      ) {
        market_id
        pool
        collateral
        expiry
        yes_symbol
        no_symbol
        trading_start
      }
    }
  `
  
  try {
    const response = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
    
    const data = await response.json()
    
    if (data.errors) {
      console.log('❌ GraphQL errors:', JSON.stringify(data.errors, null, 2))
      return
    }
    
    const markets = data.data?.binary_markets || []
    console.log(`\n✅ Found ${markets.length} active trading markets\n`)
    
    const now = Math.floor(Date.now() / 1000)
    
    markets.forEach((market: any, i: number) => {
      const secondsLeft = market.expiry - now
      const minutesLeft = Math.floor(secondsLeft / 60)
      
      console.log(`${i + 1}. ${market.yes_symbol}`)
      console.log(`   Market ID: ${market.market_id}`)
      console.log(`   Pool: ${market.pool}`)
      console.log(`   Collateral: ${market.collateral}`)
      console.log(`   Expires: ${new Date(market.expiry * 1000).toISOString()}`)
      console.log(`   Time left: ${minutesLeft} minutes (${secondsLeft}s)`)
      console.log()
    })
    
    if (markets.length === 0) {
      console.log('⚠️  No active trading markets found')
      console.log('Try querying all markets (including non-trading):')
      
      const allQuery = `
        query GetAllMarkets {
          binary_markets(
            order_by: {expiry: desc}
            limit: 5
          ) {
            market_id
            status
            expiry
            yes_symbol
          }
        }
      `
      
      const allResponse = await fetch(INDEXER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: allQuery })
      })
      
      const allData = await allResponse.json()
      const allMarkets = allData.data?.binary_markets || []
      
      console.log(`\nAll markets (last 5):`)
      allMarkets.forEach((m: any) => {
        console.log(`  ${m.yes_symbol} - status ${m.status} - exp ${new Date(m.expiry * 1000).toISOString()}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

main().catch(console.error)
