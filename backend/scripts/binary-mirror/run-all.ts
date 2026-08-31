#!/usr/bin/env npx tsx
/**
 * Run all binary mirror isolation scripts in order.
 *
 *   npx tsx scripts/binary-mirror/run-all.ts [vault] [follower]
 */
import 'dotenv/config'
import { execSync } from 'node:child_process'
import { DEFAULT_FOLLOWER, DEFAULT_VAULT, printHeader } from './lib.js'

const vault = process.argv[2] ?? DEFAULT_VAULT
const follower = process.argv[3] ?? DEFAULT_FOLLOWER
const cwd = process.cwd()

const scripts = [
  '01-vault-wiring.ts',
  '02-follower-prereqs.ts',
  '03-current-signal.ts',
  '04-mirror-events.ts',
  '06-market-onchain.ts',
  '07-order-book.ts',
  '08-quantity-math.ts',
  '09-simulate-router.ts',
  '11-follower-fills.ts',
]

printHeader(`Binary mirror isolation — run-all\nvault=${vault}\nfollower=${follower}`)

const results: Array<{ script: string; code: number }> = []

for (const script of scripts) {
  console.log(`\n>>> Running ${script}...\n`)
  try {
    execSync(`npx tsx scripts/binary-mirror/${script} ${vault} ${follower}`, {
      cwd,
      stdio: 'inherit',
    })
    results.push({ script, code: 0 })
  } catch {
    results.push({ script, code: 1 })
  }
}

printHeader('Summary')
for (const r of results) {
  console.log(`${r.code === 0 ? '✅' : '❌'} ${r.script}`)
}

const failed = results.filter((r) => r.code !== 0).length
process.exit(failed > 0 ? 1 : 0)
