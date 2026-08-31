/**
 * Create a test binary market for XRP price prediction
 * 
 *   npx tsx scripts/create-test-binary-market.ts
 */
import 'dotenv/config'
import { SignalVault, SOMNIA_RPC } from 'signalvault-sdk'

async function main() {
  const vault = new SignalVault({
    rpcUrl: SOMNIA_RPC,
    privateKey: process.env.PRIVATE_KEY,
  })

  console.log('=== Creating Test Binary Market ===')
  console.log('Market: XRP price prediction')
  console.log('Duration: 1 hour')
  console.log('Question: Will XRP be above current price in 1 hour?')
  console.log('')

  try {
    const result = await vault.createBinaryMarket({
      question: 'Will XRP be above $1.37 in 1 hour?',
      duration: 3600, // 1 hour
      category: 'CRYPTO',
      tags: ['XRP', 'price', 'prediction'],
    })

    console.log('✅ Binary market created successfully!')
    console.log('Market address:', result.marketAddress)
    console.log('Market ID:', result.marketId)
    console.log('')
    console.log('🎯 Now you can test binary signal execution!')
  } catch (error) {
    console.error('❌ Failed to create binary market:', error.message)
    console.log('💡 You may need to deploy binary market infrastructure first')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})