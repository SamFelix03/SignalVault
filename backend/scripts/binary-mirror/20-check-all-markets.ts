#!/usr/bin/env npx tsx
import 'dotenv/config'

async function main() {
  console.log('=== CHECKING ALL DREAMDEX MARKETS ===\n')
  
  const venues = ['btc-15m', 'btc-1h', 'eth-15m', 'eth-1h']
  const statuses = ['Trading', 'Closed', 'Finalized']
  
  for (const venueId of venues) {
    console.log(`\n--- Venue: ${venueId} ---`)
    
    for (const status of statuses) {
      const url = `https://api.dreamdex.io/v0/markets?venueId=${venueId}&status=${status}`
      
      try {
        const response = await fetch(url)
        const data = await response.json()
        const count = data.data?.length || 0
        
        console.log(`  ${status}: ${count} markets`)
        
        if (status === 'Trading' && count > 0) {
          const market = data.data[0]
          const expiresAt = new Date(market.expiresAt).getTime()
          const minutesLeft = Math.floor((expiresAt - Date.now()) / 60000)
          console.log(`    Next: ${market.symbol}, expires in ${minutesLeft}min`)
        }
      } catch (e) {
        console.log(`  ${status}: Error fetching`)
      }
    }
  }
  
  // Also check without filtering
  console.log('\n--- All markets (no filter) ---')
  try {
    const response = await fetch('https://api.dreamdex.io/v0/markets?limit=10')
    const data = await response.json()
    console.log(`Total markets: ${data.data?.length || 0}`)
    
    if (data.data?.length > 0) {
      console.log('\nFirst 5 markets:')
      data.data.slice(0, 5).forEach((m: any) => {
        console.log(`  ${m.symbol} - ${m.status} - expires ${new Date(m.expiresAt).toISOString()}`)
      })
    }
  } catch (e) {
    console.log('Error fetching all markets')
  }
}

main().catch(console.error)
