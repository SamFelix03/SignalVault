#!/usr/bin/env npx tsx
/**
 * 02 — Follower prerequisites: tUSDC balance, vault/router allowances, payment auth.
 *
 *   npx tsx scripts/binary-mirror/02-follower-prereqs.ts [vault] [follower]
 */
import 'dotenv/config'
import {
  createClient,
  erc20Abi,
  loadVaultBundle,
  parseArgs,
  printHeader,
  pass,
  fail,
  warn,
  info,
  formatTusdc,
} from './lib.js'
import { TESTNET_TUSDC } from '../../src/config/constants.js'

async function main() {
  const { vault, follower } = parseArgs()
  const client = createClient()
  const b = await loadVaultBundle(client, vault, follower)

  const [bal, vaultAllow, routerAllow] = await Promise.all([
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [follower, vault] }),
    client.readContract({ address: TESTNET_TUSDC, abi: erc20Abi, functionName: 'allowance', args: [follower, b.router] }),
  ])

  printHeader('02 — Follower prerequisites')

  info(`follower:         ${follower}`)
  info(`active:           ${b.cfg.active}`)
  info(`riskPct:          ${b.cfg.riskPct} (${(b.cfg.riskPct / 100).toFixed(1)}%)`)
  info(`maxPositionSize:  ${await formatTusdc(client, b.cfg.maxPositionSize)} tUSDC`)
  info(`maxSlippageBps:   ${b.cfg.maxSlippageBps}`)
  info(`signalPrice:      ${await formatTusdc(client, b.signalPrice)} tUSDC`)
  info(`collateral/signal: ${await formatTusdc(client, b.collateral)} tUSDC`)
  info(`tUSDC balance:    ${await formatTusdc(client, bal)}`)
  info(`vault allowance:  ${await formatTusdc(client, vaultAllow)} (to ${vault})`)
  info(`router allowance: ${await formatTusdc(client, routerAllow)} (to ${b.router})`)
  info(`paymentAuthorized: ${b.paymentOk}`)

  let ok = true
  if (!b.cfg.active) {
    fail('Follower not active')
    ok = false
  } else pass('Follower active')

  if (bal >= b.collateral) pass('Enough tUSDC for mirror collateral')
  else {
    fail(`Need ${await formatTusdc(client, b.collateral)} tUSDC collateral, have ${await formatTusdc(client, bal)}`)
    ok = false
  }

  if (b.signalPrice === 0n || bal >= b.signalPrice) pass('Enough tUSDC for signal fee')
  else {
    fail(`Need ${await formatTusdc(client, b.signalPrice)} tUSDC signal fee`)
    ok = false
  }

  if (routerAllow >= b.collateral) pass('Router allowance >= collateral per signal')
  else {
    fail(`Router allowance ${await formatTusdc(client, routerAllow)} < need ${await formatTusdc(client, b.collateral)}`)
    info('→ Approve tUSDC on vault page: "Approve router for trading"')
    ok = false
  }

  if (b.signalPrice === 0n || vaultAllow >= b.signalPrice) pass('Vault allowance covers signal fee')
  else {
    fail('Insufficient vault allowance for signal fees')
    ok = false
  }

  if (b.paymentOk || b.signalPrice === 0n) pass('paymentAuthorized (or free vault)')
  else {
    fail('paymentAuthorized=false — re-subscribe with vault fee approval')
    ok = false
  }

  console.log(ok ? '\n→ Prerequisites OK' : '\n→ Fix prerequisites before testing router')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
