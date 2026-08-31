#!/usr/bin/env npx tsx
/**
 * 08 — Quantity math: compare BUY_YES vs BUY_NO formulas + escrow estimate.
 *
 *   npx tsx scripts/binary-mirror/08-quantity-math.ts [vault] [follower]
 */
import 'dotenv/config'
import {
  applySlippage,
  createClient,
  formatTusdc,
  loadMarketForSignal,
  loadVaultBundle,
  parseArgs,
  printHeader,
  info,
  warn,
  qtyBuyNo,
  qtyBuyYes,
} from './lib.js'

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)
  const m = await loadMarketForSignal(client, b.signal.marketId)
  const lot = 1_000n
  const isBuyYes = b.signal.direction > 0
  const execPrice = applySlippage(b.signal.limitPrice, b.cfg.maxSlippageBps, isBuyYes)

  printHeader('08 — Quantity math')

  info(`collateral budget: ${await formatTusdc(client, b.collateral)} tUSDC`)
  info(`execPrice (raw):   ${execPrice}`)
  info(`oneCollateral:     ${m.oneCollateral}`)
  info(`lot size (assumed): ${lot}`)

  const qYes = qtyBuyYes(b.collateral, execPrice, m.oneCollateral, lot)
  const qNo = qtyBuyNo(b.collateral, execPrice, m.oneCollateral, lot)

  console.log('\n--- Formulas ---')
  console.log({
    'qty BUY_YES formula': qYes.toString(),
    'qty BUY_NO formula (fixed router)': qNo.toString(),
    direction: b.signal.direction,
    'qty used by router': b.signal.direction > 0 ? qYes.toString() : qNo.toString(),
  })

  if (b.signal.direction < 0) {
    const escrowOld = (qYes * (m.oneCollateral - execPrice)) / m.oneCollateral
    const escrowNew = (qNo * (m.oneCollateral - execPrice)) / m.oneCollateral
    console.log('\n--- BUY_NO escrow estimate ---')
    console.log({
      'if wrongly used YES qty': `${escrowOld} raw (${Number(escrowOld) / 1e6} tUSDC)`,
      'correct NO qty escrow': `${escrowNew} raw (${Number(escrowNew) / 1e6} tUSDC)`,
      'budget': b.collateral.toString(),
    })
    if (escrowOld > b.collateral) {
      warn('Old YES formula would over-escrow → pool revert (unknown error)')
    }
    if (qNo === 0n) warn('qty snaps to 0 — order will revert with "qty zero"')
  }

  if (b.signal.direction > 0 && qYes === 0n) {
    warn('YES qty snaps to 0 — order will revert')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
