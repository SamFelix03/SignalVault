#!/usr/bin/env npx tsx
import 'dotenv/config'

const MARKET_SYMBOL_YES = 'BTC-0-31AUG26-1945/tUSDC#YES'
const MARKET_SYMBOL_NO = 'BTC-0-31AUG26-1945/tUSDC#NO'

async function main() {
  console.log('=== ORDER BOOK CHECK ===')
  
  const url = `https://stg.api.dreamdex.io/v0/orderbooks?symbols=${encodeURIComponent(MARKET_SYMBOL_YES)},${encodeURIComponent(MARKET_SYMBOL_NO)}&depth=5`
  
  const response = await fetch(url)
  const data = await response.json()
  
  console.log('YES market:')
  const yesBook = data.orderbooks?.find((b: any) => b.symbol === MARKET_SYMBOL_YES)
  console.log('  Asks:', yesBook?.asks?.slice(0, 3))
  console.log('  Bids:', yesBook?.bids?.slice(0, 3))
  
  console.log('\nNO market:')
  const noBook = data.orderbooks?.find((b: any) => b.symbol === MARKET_SYMBOL_NO)
  console.log('  Asks:', noBook?.asks?.slice(0, 3))
  console.log('  Bids:', noBook?.bids?.slice(0, 3))
  
  console.log('\nSignal: BUY_NO at limit 0.801 (80.1% NO)')
  console.log('After slip: 0.825 (82.5% NO)')
  
  if (noBook?.asks?.[0]) {
    const bestNoAsk = parseFloat(noBook.asks[0][0])
    console.log(`\nBest NO ask: ${bestNoAsk}`)
    console.log(bestNoAsk > 0.825 ? '❌ NOT FILLABLE - ask too high' : '✅ FILLABLE')
  }
}

main().catch(console.error)
