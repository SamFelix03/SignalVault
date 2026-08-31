#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

async function main() {
  const pool = '0x171186a2A8D237aD194Dd3CAe9b05326407c4E11'
  
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  const params = await client.readContract({
    address: pool as `0x${string}`,
    abi: parseAbi(['function getBinaryPoolParams() view returns (address, address, address, address, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint8, uint8, uint64, uint64, uint256)']),
    functionName: 'getBinaryPoolParams'
  })
  
  console.log('Pool params:')
  console.log('  Pool:', pool)
  console.log('  oneCollateral (scale):', params[4].toString())
  console.log('  tickSize:', params[10].toString())
  console.log('  collateral decimals:', params[11])
  
  // Test our snap logic
  const testPrices = [184000, 189520, 189000, 190000]
  const tick = params[11] <= 6 ? 1000n : 1_000_000_000_000_000n
  
  console.log('\n--- Tick snapping test ---')
  console.log('  tick:', tick.toString())
  for (const p of testPrices) {
    const snapped = (BigInt(p) / tick) * tick
    console.log(`  ${p} → ${snapped} ${snapped === BigInt(p) ? '✓' : `✗ (off by ${BigInt(p) - snapped})`}`)
  }
}

main().catch(console.error)
