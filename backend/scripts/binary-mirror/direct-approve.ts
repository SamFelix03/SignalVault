#!/usr/bin/env npx tsx
/**
 * Direct approve from wallet owner to new router
 */
import 'dotenv/config'
import { createWalletClient, http, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../../src/config/chains.js'

async function main() {
  const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as const
  const router = '0xd76aeC3896918dd06bCC5f02d50b6C6aEC00140B' as const
  const tusdc = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e' as const
  
  // Try using the wallet owner's key - they might control the follower
  const pk = process.env.PRIVATE_KEY!
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  
  console.log('Approving router for follower (from owner wallet)')
  console.log('  owner:', account.address)
  console.log('  follower:', follower)
  console.log('  router:', router)
  
  // If owner != follower, we need to impersonate or use cast send --unlocked
  if (account.address.toLowerCase() !== follower.toLowerCase()) {
    console.log('⚠️  Owner wallet does not match follower - manual approval needed')
    console.log('\nRun this command manually:')
    console.log(`cast send ${tusdc} "approve(address,uint256)" ${router} 10000000000 --from ${follower} --unlocked --rpc-url https://api.infra.testnet.somnia.network`)
    return
  }
  
  const client = createWalletClient({ account, chain: somniaTestnet, transport: http() })
  
  const hash = await client.writeContract({
    address: tusdc,
    abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
    functionName: 'approve',
    args: [router, 10_000_000_000n],
  })
  
  console.log('  tx:', hash)
  console.log('✅ Approved')
}

main().catch(console.error)
