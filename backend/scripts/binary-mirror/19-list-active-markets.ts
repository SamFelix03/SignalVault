#!/usr/bin/env npx tsx
import 'dotenv/config'

async function main() {
  console.log('=== FETCHING ACTIVE MARKETS ===')
  
  const venueId = 'btc-15m' // 15-minute BTC markets
  const url = `https://api.dreamdex.io/v0/markets?venueId=${venueId}&status=Trading`
  
  console.log('Querying:', url)
  
  const response = await fetch(url)
  const data = await response.json()
  
  console.log(`\nFound ${data.data?.length || 0} active markets\n`)
  
  const now = Date.now()
  
  data.data?.slice(0, 10).forEach((market: any, i: number) => {
    const expiresAt = new Date(market.expiresAt).getTime()
    const minutesLeft = Math.floor((expiresAt - now) / 60000)
    
    console.log(`${i + 1}. ${market.symbol}`)
    console.log(`   Pool: ${market.pool}`)
    console.log(`   Expires: ${new Date(market.expiresAt).toISOString()}`)
    console.log(`   Time left: ${minutesLeft} minutes`)
    console.log(`   Market ID: ${market.marketId}`)
    console.log()
  })
}

main().catch(console.error)
