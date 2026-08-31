#!/usr/bin/env npx tsx
/**
 * Verify what the deployed router actually does with prices
 */
import 'dotenv/config'
import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

const ROUTER = '0xd76aeC3896918dd06bCC5f02d50b6C6aEC00140B'
const MIRROR = '0xE65815dAd9fb9775832fE88Aec29925204Cfd533'
const FOLLOWER = '0x6C8011a929164485c3aED93433E7363Fcb990b97'
const TUSDC = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  console.log('=== ROUTER BYTECODE VERIFICATION ===')
  console.log('Router:', ROUTER)
  
  // Get the deployed bytecode
  const code = await client.getBytecode({ address: ROUTER as `0x${string}` })
  
  if (!code) {
    console.log('❌ No code at router address!')
    return
  }
  
  console.log('Bytecode length:', code.length, 'chars')
  
  // Check for key constants in bytecode
  const codeHex = code.toLowerCase()
  
  // ORDER_TYPE_IOC = 2 (should appear as 0x02 in bytecode)
  console.log('\n--- Checking for ORDER_TYPE_IOC = 2 ---')
  console.log('  Looking for constant 2 in order type context...')
  
  // TICK values: 1000 (0x3e8) and 1e15 (0x38d7ea4c68000)
  const tick1000 = '00000000000000000000000000000000000000000000000000000000000003e8'
  const tick1e15 = '000000000000000000000000000000000000000000000000038d7ea4c68000'
  
  console.log('\n--- Checking for tick constants ---')
  console.log('  tick = 1000 (0x3e8):', codeHex.includes(tick1000.toLowerCase()) ? '✓ FOUND' : '✗ NOT FOUND')
  console.log('  tick = 1e15:', codeHex.includes(tick1e15.toLowerCase()) ? '✓ FOUND' : '✗ NOT FOUND')
  
  // Check collateral token address
  const tusdcAddr = TUSDC.slice(2).toLowerCase()
  console.log('\n--- Checking for tUSDC address ---')
  console.log('  tUSDC address:', codeHex.includes(tusdcAddr) ? '✓ FOUND' : '✗ NOT FOUND')
  
  // Try to call the router with debug tracing
  console.log('\n--- Testing router calculation ---')
  
  const marketId = '0x000000000000000000000000000000000000000000000000000000000000f51b'
  const testCases = [
    { limit: 958000n, slip: 300, expected: 986740n },
    { limit: 500000n, slip: 300, expected: 515000n },
    { limit: 100000n, slip: 300, expected: 103000n },
  ]
  
  for (const { limit, slip, expected } of testCases) {
    console.log(`\n  Input: limit=${limit}, slip=${slip}`)
    console.log(`  Expected after slip: ${expected}`)
    console.log(`  Expected after snap: ${(expected / 1000n) * 1000n}`)
    
    // We can't easily trace internal calculations, but we can see if it reverts
    try {
      await client.simulateContract({
        address: ROUTER as `0x${string}`,
        abi: parseAbi(['function placeOrder(address,bytes32,int8,uint256,uint256,uint16) returns (bytes32)']),
        functionName: 'placeOrder',
        args: [FOLLOWER as `0x${string}`, marketId as `0x${string}`, -1, 1200000n, limit, slip],
        account: MIRROR as `0x${string}`,
      })
      console.log(`  ✅ Router accepted (or failed downstream)`)
    } catch (e: any) {
      if (e.message?.includes('0xaf608abb')) {
        console.log(`  ❌ InvalidPrice from pool`)
      } else {
        console.log(`  ⚠️  Other error:`, e.shortMessage?.slice(0, 80))
      }
    }
  }
}

main().catch(console.error)
