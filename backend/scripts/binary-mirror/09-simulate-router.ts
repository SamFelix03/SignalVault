#!/usr/bin/env npx tsx
/**
 * 09 — Simulate EventContractsRouter.placeOrder via eth_call (multiple scenarios).
 *
 *   npx tsx scripts/binary-mirror/09-simulate-router.ts [vault] [follower]
 */
import 'dotenv/config'
import { encodeFunctionData } from 'viem'
import {
  applySlippage,
  createClient,
  formatTusdc,
  loadVaultBundle,
  parseArgs,
  printHeader,
  routerAbi,
  info,
} from './lib.js'

async function tryCall(
  client: ReturnType<typeof createClient>,
  label: string,
  args: {
    mirror: `0x${string}`
    router: `0x${string}`
    follower: `0x${string}`
    marketId: `0x${string}`
    direction: number
    collateral: bigint
    limitPrice: bigint
    slippage: number
  },
) {
  try {
    await client.call({
      account: args.mirror,
      to: args.router,
      data: encodeFunctionData({
        abi: routerAbi,
        functionName: 'placeOrder',
        args: [
          args.follower,
          args.marketId,
          args.direction,
          args.collateral,
          args.limitPrice,
          args.slippage,
        ],
      }),
    })
    console.log(`✅ ${label}`)
    return true
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`❌ ${label}`)
    console.log(`   ${msg.split('\n').slice(0, 3).join(' | ')}`)
    return false
  }
}

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  const isBuyYes = b.signal.direction > 0
  const execPrice = applySlippage(b.signal.limitPrice, b.cfg.maxSlippageBps, isBuyYes)

  printHeader('09 — Simulate router.placeOrder')

  info(`mirror:  ${b.mirror}`)
  info(`router:  ${b.router}`)
  info(`collateral: ${await formatTusdc(client, b.collateral)} tUSDC`)

  const base = {
    mirror: b.mirror,
    router: b.router,
    follower,
    marketId: b.signal.marketId,
    slippage: b.cfg.maxSlippageBps,
  }

  console.log('\n--- Scenarios ---')
  await tryCall(client, 'A) on-chain signal (direction + limit)', {
    ...base,
    direction: b.signal.direction,
    collateral: b.collateral,
    limitPrice: b.signal.limitPrice,
  })

  await tryCall(client, 'B) on-chain direction + execPrice after slippage', {
    ...base,
    direction: b.signal.direction,
    collateral: b.collateral,
    limitPrice: execPrice,
  })

  await tryCall(client, 'C) force BUY_YES @ ask+5% (0.50)', {
    ...base,
    direction: 1,
    collateral: b.collateral,
    limitPrice: 500_000n,
  })

  await tryCall(client, 'D) force BUY_NO @ bid-5% (0.30 YES limit)', {
    ...base,
    direction: -1,
    collateral: b.collateral,
    limitPrice: 300_000n,
  })

  await tryCall(client, 'E) 10x collateral BUY_NO @ 0.30', {
    ...base,
    direction: -1,
    collateral: b.collateral * 10n,
    limitPrice: 300_000n,
  })

  console.log('\nNote: eth_call may not surface custom pool errors. If all fail, run 10-decode-mirror-tx on a real mirror tx.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
