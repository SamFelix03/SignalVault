#!/usr/bin/env npx tsx
/**
 * Test pool directly with various prices to find what it accepts
 */
import 'dotenv/config'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

const POOL = '0x171186a2A8D237aD194Dd3CAe9b05326407c4E11'
const TUSDC = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'

const poolAbi = parseAbi([
  'function placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k, uint64 userData) external payable returns (bool success, uint128 id)'
])

async function main() {
  const pk = process.env.PRIVATE_KEY!
  const account = privateKeyToAccount(pk as `0x${string}`)
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  console.log('=== DIRECT POOL PRICE TESTING ===')
  console.log('Pool:', POOL)
  console.log('Testing account:', account.address)
  
  // Test various prices to see what the pool accepts
  const testPrices = [
    { name: 'Order book NO ask', price: 997000n }, // From order book
    { name: 'Round 95%', price: 950000n },
    { name: 'Round 90%', price: 900000n },
    { name: 'Our snapped price', price: 986000n },
    { name: 'Unsnapped price', price: 986740n },
    { name: 'Signal limit', price: 958000n },
    { name: 'Multiple of 1000', price: 123000n },
    { name: 'Not multiple of 1000', price: 123456n },
  ]
  
  const kind = 2 // BUY_NO
  const quantity = 1_000_000n // 1 outcome token
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)
  const orderType = 2 // IOC
  
  for (const { name, price } of testPrices) {
    console.log(`\n--- Testing: ${name} (${price}) ---`)
    console.log(`  Price % 1000 = ${price % 1000n} ${price % 1000n === 0n ? '✓ aligned' : '✗ NOT aligned'}`)
    console.log(`  Price % 1 = ${price % 1n} ${price % 1n === 0n ? '✓ whole number' : '✗ NOT whole'}`)
    
    try {
      const result = await client.simulateContract({
        address: POOL as `0x${string}`,
        abi: poolAbi,
        functionName: 'placeBinaryOrder',
        args: [kind, price, quantity, expireNs, orderType, 0, '0x0000000000000000000000000000000000000000', 0n, 0n],
        account: account.address,
      })
      console.log(`  ✅ ACCEPTED by pool`)
      console.log(`  Result:`, result.result)
    } catch (e: any) {
      const msg = e.message || e.shortMessage || String(e)
      if (msg.includes('0xaf608abb')) {
        console.log(`  ❌ InvalidPrice error`)
      } else if (msg.includes('insufficient')) {
        console.log(`  ⚠️  Insufficient balance/allowance (expected, not a price issue)`)
      } else {
        console.log(`  ❌ Error:`, msg.split('\n')[0].slice(0, 100))
      }
    }
  }
  
  console.log('\n=== TESTING COMPLETE ===')
}

main().catch(console.error)
