#!/usr/bin/env npx tsx
/**
 * Approve new router for follower (run as follower wallet).
 *
 *   npx tsx scripts/binary-mirror/approve-router.ts <vault> [amount]
 */
import 'dotenv/config'
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL, TESTNET_TUSDC } from '../../src/config/constants.js'

async function main() {
  const vault = process.argv[2] as Address
  const amount = process.argv[3] ?? '1000' // default 1000 tUSDC
  const pk = process.env.FOLLOWER_PRIVATE_KEY ?? process.env.PRIVATE_KEY
  
  if (!vault || !pk) {
    console.error('Usage: approve-router.ts <vault> [amount]')
    console.error('Env: FOLLOWER_PRIVATE_KEY (or PRIVATE_KEY)')
    process.exit(1)
  }

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const router = await publicClient.readContract({
    address: vault,
    abi: parseAbi(['function eventRouter() view returns (address)']),
    functionName: 'eventRouter',
  })

  const amountWei = BigInt(amount) * 1_000_000n // 6 decimals

  console.log('Approving router for follower')
  console.log('  follower:', account.address)
  console.log('  vault:', vault)
  console.log('  router:', router)
  console.log('  amount:', amount, 'tUSDC')

  const hash = await walletClient.writeContract({
    address: TESTNET_TUSDC,
    abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
    functionName: 'approve',
    args: [router, amountWei],
    account,
    chain: somniaTestnet,
  })

  console.log('  tx:', hash)
  await publicClient.waitForTransactionReceipt({ hash })
  console.log('✅ Router approved')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
