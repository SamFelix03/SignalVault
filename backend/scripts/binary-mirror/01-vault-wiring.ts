#!/usr/bin/env npx tsx
/**
 * 01 — Vault wiring: mirror, router, instrument type alignment.
 *
 *   npx tsx scripts/binary-mirror/01-vault-wiring.ts [vault] [follower]
 */
import 'dotenv/config'
import {
  createClient,
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

  printHeader('01 — Vault wiring')

  info(`vault:      ${vault}`)
  info(`follower:   ${follower}`)
  info(`instrument: ${b.instrument === 1 ? 'PERP' : 'BINARY'}`)
  info(`mirror:     ${b.mirror}`)
  info(`router:     ${b.router}`)
  info(`strategist: ${b.strategist}`)
  info(`mirror.vault:   ${b.mirrorVault}`)
  info(`mirror.router:  ${b.mirrorRouter}`)
  info(`subscriptionId: ${b.subId.toString()} (on MirrorReactor contract)`)
  info(`totalMirrored:  ${b.totalMirrored.toString()}`)

  let ok = true
  if (b.instrument !== 0) {
    fail('Vault is not BINARY — use perp scripts instead')
    ok = false
  } else pass('Instrument type is BINARY')

  if (b.mirrorVault.toLowerCase() === vault.toLowerCase()) pass('MirrorReactor points to this vault')
  else {
    fail(`MirrorReactor vault mismatch: ${b.mirrorVault}`)
    ok = false
  }

  if (b.mirrorRouter.toLowerCase() === b.router.toLowerCase()) pass('MirrorReactor.router == vault.eventRouter')
  else {
    fail(`Router mismatch: mirror=${b.mirrorRouter} vault=${b.router}`)
    ok = false
  }

  if (b.followers.map((f) => f.toLowerCase()).includes(follower.toLowerCase())) {
    pass('Follower is in vault.getFollowers()')
  } else {
    fail('Follower not subscribed on vault')
    ok = false
  }

  if (b.subId === 0n) {
    warn('mirror.subscriptionId=0 (reactivity may still work via direct precompile sub)')
  }

  console.log(ok ? '\n→ Wiring OK' : '\n→ Wiring issues found')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
