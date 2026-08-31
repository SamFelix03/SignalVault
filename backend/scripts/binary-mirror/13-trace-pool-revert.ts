#!/usr/bin/env npx tsx
/**
 * 13 — Trace exact pool revert by simulating placeBinaryOrder with router params.
 *
 *   npx tsx scripts/binary-mirror/13-trace-pool-revert.ts [vault] [follower]
 */
import 'dotenv/config'
import { encodeFunctionData, parseAbi } from 'viem'
import {
  applySlippage,
  createClient,
  loadVaultBundle,
  loadMarketForSignal,
  parseArgs,
  printHeader,
  pass,
  fail,
  info,
} from './lib.js'
import { TESTNET_TUSDC } from '../../src/config/constants.js'

const poolAbi = parseAbi([
  'function placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k, uint64 userData) external payable returns (bool success, uint128 id)',
  'function getBinaryPoolParams() view returns (address collateralToken, address market, address outcomeToken, uint256 yesId, uint256 noId, uint256 oneCollateral, uint256 setBacking, address feeRecipient, uint256 makerFeeBpsTimes1k, uint256 takerFeeBpsTimes1k, uint256 maxBuilderFeeBpsTimes1k, uint256 settlementFeeBpsTimes1k, address settlement, uint64 marketNonce, bool finalized)',
])

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
])

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  
  if (b.signal.direction === 0) {
    fail('Signal is FLAT — no order to trace')
    process.exit(1)
  }

  const market = await loadMarketForSignal(client, b.signal.marketId)
  const isBuyYes = b.signal.direction > 0
  const kind = isBuyYes ? 0 : 2 // BUY_YES : BUY_NO
  const outcomeId = isBuyYes ? market.yesId : market.noId

  // Router logic: apply slippage to signal limit
  const execPrice = applySlippage(b.signal.limitPrice, b.cfg.maxSlippageBps)
  
  // Router quantity formula: (collateral * oneCollateral) / price
  const rawQty = (b.collateral * market.oneCollateral) / execPrice
  const lot = 1_000n
  const quantity = rawQty < lot ? 0n : (rawQty / lot) * lot

  printHeader('13 — Trace pool revert')

  info(`signal:      ${b.signal.direction > 0 ? 'UP (BUY_YES)' : 'DOWN (BUY_NO)'}`)
  info(`market:      ${market.marketId}`)
  info(`pool:        ${market.pool}`)
  info(`collateral:  ${b.collateral} (${Number(b.collateral) / 1e6} tUSDC)`)
  info(`signal limit: ${b.signal.limitPrice} (${Number(b.signal.limitPrice) / 1e6 * 100}% ${isBuyYes ? 'YES' : 'NO'})`)
  info(`exec price:  ${execPrice} (after ${b.cfg.maxSlippageBps}bps slip)`)
  info(`quantity:    ${quantity}`)
  info(`kind:        ${kind} (${isBuyYes ? 'BUY_YES' : 'BUY_NO'})`)
  info(`outcomeId:   ${outcomeId}`)

  // Check router allowances
  const [routerTusdcBal, routerTusdcAllowance] = await Promise.all([
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'balanceOf', args: [b.router] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [b.router, market.pool] }),
  ])

  info(`router tUSDC bal: ${routerTusdcBal}`)
  info(`router→pool allow: ${routerTusdcAllowance}`)

  if (quantity === 0n) {
    fail('Quantity is ZERO — order will fail (collateral too small or price too high)')
    process.exit(1)
  }

  console.log('\n--- Simulate placeBinaryOrder (as router) ---')

  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000)
  
  try {
    const result = await client.simulateContract({
      address: market.pool,
      abi: poolAbi,
      functionName: 'placeBinaryOrder',
      args: [kind, execPrice, quantity, expireNs, 1, 0, '0x0000000000000000000000000000000000000000', 0, 0],
      account: b.router,
    })
    pass('Pool simulation passed!')
    console.log('Result:', result.result)
  } catch (e: any) {
    fail('Pool simulation FAILED')
    console.log('\n--- Error Details ---')
    console.log('Message:', e.message?.split('\n')[0])
    console.log('Short:', e.shortMessage)
    if (e.cause?.reason) console.log('Reason:', e.cause.reason)
    if (e.cause?.data) console.log('Data:', e.cause.data)
    if (e.data) console.log('Raw data:', e.data)
    
    // Try to decode common reverts
    const msg = e.message || ''
    if (msg.includes('insufficient')) {
      console.log('\n💡 Likely: insufficient collateral balance or allowance')
    } else if (msg.includes('quantity') || msg.includes('qty')) {
      console.log('\n💡 Likely: quantity too small or not lot-aligned')
    } else if (msg.includes('price')) {
      console.log('\n💡 Likely: price out of valid range or tick-misaligned')
    } else if (msg.includes('expired') || msg.includes('time')) {
      console.log('\n💡 Likely: order expired or market not trading')
    }
    
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
