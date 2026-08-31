#!/usr/bin/env npx tsx
/**
 * Place a maker order to provide liquidity for testing
 */
import 'dotenv/config'
import { createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

const POOL = '0x4143cD6dcBAc98D05a7e0406947d46Eb14651EC9' // Current live market
const TUSDC = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'

async function main() {
  const pk = process.env.PRIVATE_KEY!
  const account = privateKeyToAccount(pk as `0x${string}`)
  const client = createWalletClient({ 
    account, 
    chain: somniaTestnet, 
    transport: http(RPC_URL) 
  })
  
  console.log('=== PLACING MAKER ORDER FOR LIQUIDITY ===')
  console.log('Account:', account.address)
  console.log('Pool:', POOL)
  
  // Place a SELL NO order (provide NO ask liquidity)
  // Signal wants to BUY NO at 0.825, so let's offer to SELL NO at 0.75
  const kind = 3 // SELL_NO
  const price = 750000n // 75% NO (= 25% YES)
  const quantity = 5_000_000n // 5 NO tokens
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 600) * 1_000_000_000) // 10 min
  const orderType = 0 // LIMIT (rests on book)
  
  console.log('\nOrder details:')
  console.log('  Type: SELL NO (provide ask liquidity)')
  console.log('  Price:', Number(price) / 1e6 * 100, '% NO')
  console.log('  Quantity:', Number(quantity) / 1e6, 'tokens')
  console.log('  Order type: LIMIT (post-only)')
  
  const poolAbi = parseAbi([
    'function placeBinaryOrder(uint8,uint256,uint256,uint64,uint8,uint8,address,uint96,uint64) payable returns (bool,uint128)'
  ])
  
  try {
    const hash = await client.writeContract({
      address: POOL as `0x${string}`,
      abi: poolAbi,
      functionName: 'placeBinaryOrder',
      args: [kind, price, quantity, expireNs, orderType, 0, '0x0000000000000000000000000000000000000000', 0n, 0n],
    })
    
    console.log('\n✅ Order placed!')
    console.log('   Tx:', hash)
    console.log('\nNow the mirroring system can test against this liquidity!')
    
  } catch (e: any) {
    console.error('\n❌ Failed:', e.shortMessage || e.message)
    console.error('This is expected if you need to mint NO tokens first')
  }
}

main().catch(console.error)
