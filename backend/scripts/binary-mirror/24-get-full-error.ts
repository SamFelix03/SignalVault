#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

const POOL = '0x4143cD6dcBAc98D05a7e0406947d46Eb14651EC9'

const poolAbi = parseAbi([
  'function placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k, uint64 userData) external payable returns (bool success, uint128 id)'
])

async function main() {
  const pk = process.env.PRIVATE_KEY!
  const account = privateKeyToAccount(pk as `0x${string}`)
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  console.log('=== DETAILED ERROR FOR ALIGNED PRICE ===')
  
  const kind = 2 // BUY_NO
  const price = 825000n // Aligned
  const quantity = 1_000_000n
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)
  const orderType = 2 // IOC
  
  try {
    await client.simulateContract({
      address: POOL as `0x${string}`,
      abi: poolAbi,
      functionName: 'placeBinaryOrder',
      args: [kind, price, quantity, expireNs, orderType, 0, '0x0000000000000000000000000000000000000000', 0n, 0n],
      account: account.address,
    })
  } catch (e: any) {
    console.log('\nFull error object:')
    console.log('Name:', e.name)
    console.log('Message:', e.message)
    console.log('ShortMessage:', e.shortMessage)
    console.log('Cause:', e.cause?.shortMessage || e.cause)
    console.log('\nData:', e.data)
    console.log('Details:', e.details)
    
    if (e.cause?.data) {
      console.log('\nCause data:', e.cause.data)
    }
  }
}

main().catch(console.error)
