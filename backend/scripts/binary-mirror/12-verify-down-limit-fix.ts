#!/usr/bin/env npx tsx
/**
 * Verify DOWN limit fix: old (YES bid) vs new (NO ask) router simulation.
 *
 *   npx tsx scripts/binary-mirror/12-verify-down-limit-fix.ts [vault] [follower]
 *
 * Exit 0 only if NEW limit simulates successfully and OLD limit fails (or both pass with new better).
 */
import 'dotenv/config'
import { encodeFunctionData } from 'viem'
import { pickLiveMarket, TESTNET_COLLATERAL_DECIMALS, snapToTickGrid } from '../../../sdk/dist/index.js'
import {
  applySlippage,
  collateralForSignal,
  createClient,
  decodeLimitHuman,
  loadVaultBundle,
  parseArgs,
  printHeader,
  routerAbi,
  pass,
  fail,
  info,
} from './lib.js'
import { RPC_URL, WS_RPC_URL, MARKETS_INDEXER_URL } from '../../src/config/constants.js'

async function simulate(
  client: ReturnType<typeof createClient>,
  mirror: `0x${string}`,
  router: `0x${string}`,
  follower: `0x${string}`,
  marketId: `0x${string}`,
  collateral: bigint,
  limitPrice: bigint,
  slippage: number,
) {
  try {
    await client.call({
      account: mirror,
      to: router,
      data: encodeFunctionData({
        abi: routerAbi,
        functionName: 'placeOrder',
        args: [follower, marketId, -1, collateral, limitPrice, slippage],
      }),
    })
    return true
  } catch {
    return false
  }
}

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)

  const pick = await pickLiveMarket({
    indexerUrl: MARKETS_INDEXER_URL,
    rpcUrl: RPC_URL,
    wsRpcUrl: WS_RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    asset: 'BTC',
    minSecondsLeft: 60,
    collateralDecimals: TESTNET_COLLATERAL_DECIMALS,
  })

  if (!pick) throw new Error('No live BTC market')

  const dec = 6
  const oldLimit = snapToTickGrid(Math.max(0, pick.bestBid - 0.02), dec)
  const newLimit = pick.suggestedLimitPriceDown

  printHeader('12 — Verify DOWN limit fix')

  info(`market:     ${pick.upSymbol}`)
  info(`YES bid/ask: ${pick.bestBid} / ${pick.bestAsk}`)
  info(`NO ask:      ${pick.bestNoAsk ?? 'n/a'}`)
  info(`OLD limit (YES bid-2%): ${oldLimit} = ${decodeLimitHuman(oldLimit)} [wrong: YES terms on BUY_NO]`)
  info(`NEW limit (NO ask+2%):  ${newLimit} = ${(Number(newLimit) / 1e6 * 100).toFixed(2)}% NO`)
  info(`exec NEW after slip:    ${applySlippage(newLimit, b.cfg.maxSlippageBps)}`)

  const collateral =
    b.collateral > 0n
      ? b.collateral
      : collateralForSignal(b.cfg.maxPositionSize, 10_000, b.cfg.riskPct)

  const oldOk = await simulate(
    client, b.mirror, b.router, follower, pick.marketId, collateral, oldLimit, b.cfg.maxSlippageBps,
  )
  const newOk = await simulate(
    client, b.mirror, b.router, follower, pick.marketId, collateral, newLimit, b.cfg.maxSlippageBps,
  )

  console.log('\n--- Simulation (BUY_NO, router eth_call) ---')
  console.log(oldOk ? '❌ OLD limit unexpectedly passes' : '✅ OLD limit fails (expected)')
  console.log(newOk ? '✅ NEW limit passes' : '❌ NEW limit fails')

  if (!newOk) {
    fail('Fix not verified — NEW limit still fails. Check router deployment / book liquidity.')
    process.exit(1)
  }

  pass('DOWN limit fix verified — NEW NO-ask-based limit simulates successfully')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
