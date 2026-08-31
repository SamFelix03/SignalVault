#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

const POOL = '0x4143cD6dcBAc98D05a7e0406947d46Eb14651EC9' // Current market pool
const MARKET = '0x000000000000000000000000000000000000000000000000000000000000f554'

const poolAbi = parseAbi([
  'function placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k, uint64 userData) external payable returns (bool success, uint128 id)'
])

async function main() {
  const pk = process.env.PRIVATE_KEY!
  const account = privateKeyToAccount(pk as `0x${string}`)
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  console.log('=== TESTING PRICES ON LIVE MARKET ===')
  console.log('Market:', MARKET)
  console.log('Pool:', POOL)
  
  const testPrices = [
    { name: 'Signal limit', price: 801000n },
    { name: 'After slip (unsnapped)', price: 825030n },
    { name: 'After slip (snapped)', price: 825000n },
    { name: 'Lower price', price: 500000n },
    { name: 'Very low price', price: 100000n },
  ]
  
  const kind = 2 // BUY_NO
  const quantity = 1_000_000n
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)
  const orderType = 2 // IOC
  
  for (const { name, price } of testPrices) {
    console.log(`\n--- ${name}: ${price} ---`)
    console.log(`  Aligned to 1000: ${price % 1000n === 0n ? '✓' : '✗'}`)
    
    try {
      await client.simulateContract({
        address: POOL as `0x${string}`,
        abi: poolAbi,
        functionName: 'placeBinaryOrder',
        args: [kind, price, quantity, expireNs, orderType, 0, '0x0000000000000000000000000000000000000000', 0n, 0n],
        account: account.address,
      })
      console.log(`  ✅ ACCEPTED`)
    } catch (e: any) {
      if (e.message?.includes('0xaf608abb')) {
        console.log(`  ❌ InvalidPrice`)
      } else if (e.message?.includes('insufficient')) {
        console.log(`  ⚠️  Insufficient balance (price OK)`)
      } else {
        console.log(`  ❌`, e.shortMessage?.slice(0, 60))
      }
    }
  }
}

main().catch(console.error)
