#!/usr/bin/env npx tsx
/**
 * 03 — Current on-chain signal + human-readable limit price.
 *
 *   npx tsx scripts/binary-mirror/03-current-signal.ts [vault] [follower]
 */
import 'dotenv/config'
import {
  applySlippage,
  createClient,
  decodeLimitHuman,
  loadVaultBundle,
  maxNoPayHuman,
  parseArgs,
  printHeader,
  info,
} from './lib.js'

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  const s = b.signal

  printHeader('03 — Current signal')

  const dir = s.direction === 1 ? 'UP (BUY_YES)' : s.direction === -1 ? 'DOWN (BUY_NO)' : 'FLAT'
  const isBuyYes = s.direction > 0
  const execPrice = applySlippage(s.limitPrice, b.cfg.maxSlippageBps)

  info(`direction:   ${s.direction} → ${dir}`)
  info(`sizeBps:     ${s.sizeBps} (${(s.sizeBps / 100).toFixed(1)}%)`)
  info(`marketId:    ${s.marketId}`)
  info(`limitPrice:  ${s.limitPrice.toString()} raw`)
  
  if (isBuyYes) {
    info(`             ${decodeLimitHuman(s.limitPrice)} [YES price]`)
    info(`execPrice:   ${execPrice.toString()} raw → ${decodeLimitHuman(execPrice)}`)
  } else {
    const limitNo = Number(s.limitPrice) / 1e6 * 100
    const execNo = Number(execPrice) / 1e6 * 100
    info(`             ${limitNo.toFixed(2)}% NO [NO price for BUY_NO]`)
    info(`execPrice:   ${execPrice.toString()} raw → ${execNo.toFixed(2)}% NO (after ${b.cfg.maxSlippageBps}bps slip)`)
  }
  
  info(`epoch/block: ${s.epoch.toString()}`)
  info(`summary:     ${s.reasoningSummary.slice(0, 120)}…`)
  info(`collateral:  ${b.collateral.toString()} raw units for this follower`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
