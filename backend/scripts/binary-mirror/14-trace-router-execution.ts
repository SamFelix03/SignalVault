#!/usr/bin/env npx tsx
/**
 * 14 — Simulate full router.placeOrder (not just pool call) to see where it fails.
 *
 *   npx tsx scripts/binary-mirror/14-trace-router-execution.ts [vault] [follower]
 */
import 'dotenv/config'
import { parseAbi } from 'viem'
import {
  createClient,
  loadVaultBundle,
  parseArgs,
  printHeader,
  fail,
  info,
  erc20Abi,
} from './lib.js'
import { TESTNET_TUSDC } from '../../src/config/constants.js'

const routerAbi = parseAbi([
  'function placeOrder(address follower, bytes32 marketRef, int8 direction, uint256 collateralAmount, uint256 limitPrice, uint16 maxSlippageBps) returns (bytes32 fillId)',
])

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  
  if (b.signal.direction === 0) {
    fail('Signal is FLAT — no order to trace')
    process.exit(1)
  }

  printHeader('14 — Trace router.placeOrder execution')

  info(`mirror:      ${b.mirror}`)
  info(`router:      ${b.router}`)
  info(`follower:    ${follower}`)
  info(`collateral:  ${b.collateral} (${Number(b.collateral) / 1e6} tUSDC)`)
  info(`direction:   ${b.signal.direction}`)
  info(`limit:       ${b.signal.limitPrice}`)
  info(`slippage:    ${b.cfg.maxSlippageBps}`)

  // Check follower balances/allowances
  const [followerBal, followerRouterAllow] = await Promise.all([
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [follower, b.router] }),
  ])

  console.log('\n--- Follower prerequisites ---')
  info(`tUSDC balance:     ${followerBal} (${Number(followerBal) / 1e6})`)
  info(`router allowance:  ${followerRouterAllow} (${Number(followerRouterAllow) / 1e6})`)
  
  if (followerBal < b.collateral) {
    fail(`Insufficient balance: need ${b.collateral}, have ${followerBal}`)
  }
  if (followerRouterAllow < b.collateral) {
    fail(`Insufficient allowance: need ${b.collateral}, have ${followerRouterAllow}`)
  }

  console.log('\n--- Simulate router.placeOrder (as mirror) ---')

  try {
    const result = await client.simulateContract({
      address: b.router,
      abi: routerAbi,
      functionName: 'placeOrder',
      args: [follower, b.signal.marketId, b.signal.direction, b.collateral, b.signal.limitPrice, b.cfg.maxSlippageBps],
      account: b.mirror,
    })
    console.log('✅ Router simulation PASSED!')
    console.log('Fill ID:', result.result)
    process.exit(0)
  } catch (e: any) {
    fail('Router simulation FAILED')
    console.log('\n--- Error Details ---')
    console.log('Message:', e.message?.split('\n').slice(0, 3).join(' | '))
    console.log('Short:', e.shortMessage)
    
    if (e.cause?.reason) console.log('Reason:', e.cause.reason)
    if (e.cause?.data) console.log('Revert data:', e.cause.data)
    if (e.data) console.log('Raw data:', e.data)
    
    // Parse common failure patterns
    const msg = (e.message || '').toLowerCase()
    
    console.log('\n--- Diagnosis ---')
    
    if (msg.includes('transfer') && msg.includes('fail')) {
      console.log('💡 transferFrom(follower → router) failed')
      console.log('   Check: follower balance, follower→router allowance')
    } else if (msg.includes('approve')) {
      console.log('💡 approve(router → pool) failed')
      console.log('   Unusual - approve should not fail unless token is non-standard')
    } else if (msg.includes('order') || msg.includes('0xaf608abb')) {
      console.log('💡 placeBinaryOrder failed at the pool')
      console.log('   Revert signature: 0xaf608abb')
      console.log('   Likely: quantity, price, or market status issue')
    } else if (msg.includes('unknown')) {
      console.log('💡 Generic pool revert (catch-all in MirrorReactor)')
      console.log('   The pool rejected the order but reason was not decoded')
    }
    
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
