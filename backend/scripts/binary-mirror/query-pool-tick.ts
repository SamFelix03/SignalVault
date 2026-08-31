#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'
import { poolAbi } from './lib.js'

async function main() {
  const pool = '0x171186a2A8D237aD194Dd3CAe9b05326407c4E11'
  
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  const result = await client.call({
    to: pool as `0x${string}`,
    abi: poolAbi,
    functionName: 'getBinaryPoolParams'
  })
  
  if (!result.data) {
    console.log('No data returned')
    return
  }
  
  // The data is ABI-encoded. Let's parse it manually focusing on just the fields we need
  const hex = result.data.slice(2) // remove 0x
  
  // Each return value is 32 bytes (64 hex chars). We want indexes 5 (oneCollateral), 9 (takerFee), 10 (maxBuilderFee)
  // Actually according to the ABI, the order is:
  // 0: collateralToken (address = 20 bytes but padded to 32)
  // 1: market (address)
  // 2: outcomeToken (address)
  // 3: yesId (uint256)
  // 4: noId (uint256)
  // 5: oneCollateral (uint256) ← THIS
  // ...more fields
  
  const oneCollateralHex = hex.slice(64 * 5, 64 * 6)
  const oneCollateral = BigInt('0x' + oneCollateralHex)
  
  console.log('Pool:', pool)
  console.log('oneCollateral (scale):', oneCollateral.toString())
  console.log('oneCollateral (decimal):', Number(oneCollateral) / 1e6)
  
  // For 6-decimal collateral, tick should be 1000
  const expectedTick = oneCollateral <= 1_000_000n ? 1_000n : 1_000_000_000_000_000n
  console.log('Expected tick (based on oneCollateral):', expectedTick.toString())
  
  // Test prices
  const testPrices = [184000n, 189520n, 189000n, 190000n]
  console.log('\n--- Tick alignment test ---')
  for (const p of testPrices) {
    const snapped = (p / expectedTick) * expectedTick
    const aligned = p % expectedTick === 0n
    console.log(`  ${p} → ${snapped} ${aligned ? '✓ aligned' : `✗ off by ${p - snapped}`}`)
  }
}

main().catch(console.error)
