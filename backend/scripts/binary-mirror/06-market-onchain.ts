#!/usr/bin/env npx tsx
/**
 * 06 — On-chain market status for current signal's marketId.
 *
 *   npx tsx scripts/binary-mirror/06-market-onchain.ts [vault] [follower]
 */
import 'dotenv/config'
import { TESTNET_TUSDC } from '../../src/config/constants.js'
import {
  createClient,
  loadMarketForSignal,
  loadVaultBundle,
  parseArgs,
  printHeader,
  pass,
  fail,
  warn,
  info,
} from './lib.js'

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)

  if (b.signal.marketId === `0x${'0'.repeat(64)}`) {
    fail('No active market on current signal')
    process.exit(1)
  }

  const m = await loadMarketForSignal(client, b.signal.marketId)

  printHeader('06 — Market on-chain')

  info(`marketId:    ${m.marketId}`)
  info(`market:      ${m.marketAddr}`)
  info(`pool:        ${m.pool}`)
  info(`status:      ${m.statusLabel}`)
  info(`expiry:      ${m.expiry.toString()}`)
  info(`secondsLeft: ${m.secondsLeft.toString()}`)
  info(`collateral:  ${m.collateral}`)
  info(`oneCollateral: ${m.oneCollateral.toString()}`)
  info(`outcomeToken: ${m.outcomeToken}`)
  info(`yesId/noId:  ${m.yesId} / ${m.noId}`)

  let ok = true
  if (m.status === 1) pass('Market status TRADING')
  else {
    fail(`Market not trading (status=${m.status})`)
    ok = false
  }

  if (m.collateral.toLowerCase() === TESTNET_TUSDC.toLowerCase()) pass('Collateral is tUSDC')
  else {
    fail('Collateral mismatch')
    ok = false
  }

  if (m.secondsLeft > 60n) pass('Market has >60s until expiry')
  else {
    warn('Market expiring soon — IOC may fail')
    ok = false
  }

  console.log(ok ? '\n→ Market OK for trading' : '\n→ Market may block orders')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
