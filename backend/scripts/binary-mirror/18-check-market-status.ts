#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL, BINARY_MARKETS_MODULE } from '../../src/config/constants.js'

async function main() {
  const marketId = process.argv[2] || '0x000000000000000000000000000000000000000000000000000000000000f554'
  
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  const marketsAbi = parseAbi([
    'function markets(bytes32) view returns (uint256,uint8,uint8,address,uint32,bytes32,address,address,address,address,uint256,uint256,uint64,uint64)'
  ])
  
  const marketAbi = parseAbi(['function status() view returns (uint8)'])
  
  console.log('=== MARKET STATUS CHECK ===')
  console.log('Market ID:', marketId)
  
  const row = await client.readContract({
    address: BINARY_MARKETS_MODULE,
    abi: marketsAbi,
    functionName: 'markets',
    args: [marketId as `0x${string}`],
  })
  
  const marketAddr = row[8]
  const pool = row[9]
  const expiry = row[13]
  
  console.log('Market address:', marketAddr)
  console.log('Pool:', pool)
  console.log('Expiry:', expiry, `(${new Date(Number(expiry) * 1000).toISOString()})`)
  
  const status = await client.readContract({
    address: marketAddr,
    abi: marketAbi,
    functionName: 'status',
  })
  
  const now = BigInt(Math.floor(Date.now() / 1000))
  const secondsLeft = expiry - now
  
  console.log('\nStatus:', status)
  console.log('  0 = Uninitialized')
  console.log('  1 = TRADING ✓')
  console.log('  2 = Closed')
  console.log('  3 = Finalized')
  
  console.log('\nCurrent status:', status === 1 ? '✅ TRADING' : `❌ NOT TRADING (status=${status})`)
  console.log('Time until expiry:', secondsLeft, 'seconds', `(${Math.floor(Number(secondsLeft) / 60)} minutes)`)
  
  if (secondsLeft <= 0n) {
    console.log('⚠️  Market has EXPIRED!')
  }
}

main().catch(console.error)
