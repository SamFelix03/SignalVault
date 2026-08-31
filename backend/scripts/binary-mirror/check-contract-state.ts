#!/usr/bin/env npx tsx
/**
 * Check actual contract state: vault signal, mirror counter, follower tokens.
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL, BINARY_MARKETS_MODULE } from '../../src/config/constants.js'

const vault = '0xd97cBa8979EAA4b1eE6661Ab64b70a5d88E68Eb8'
const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97'

const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })

const vaultAbi = parseAbi([
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
  'function mirrorReactor() view returns (address)',
  'function eventRouter() view returns (address)',
])

const mirrorAbi = parseAbi([
  'function totalMirrored() view returns (uint256)',
  'function vault() view returns (address)',
])

const marketsAbi = parseAbi([
  'function markets(bytes32) view returns (uint256, uint8, uint8, address, uint32, bytes32, address, address, address, address, uint256, uint256, uint64, uint64)',
])

const marketAbi = parseAbi(['function outcomeToken() view returns (address)'])

const erc6909Abi = parseAbi([
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
])

async function main() {
console.log('=== CHECKING CONTRACT STATE DIRECTLY ===\n')

const [signal, mirror, router] = await Promise.all([
  client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: 'eventRouter' }),
])

console.log('Vault:', vault)
console.log('Mirror:', mirror)
console.log('Router:', router)
console.log('\n--- Current Signal ---')
console.log('Direction:', signal.direction, signal.direction > 0 ? '(UP)' : signal.direction < 0 ? '(DOWN)' : '(FLAT)')
console.log('Market ID:', signal.marketId)
console.log('Limit price:', signal.limitPrice.toString(), `(${Number(signal.limitPrice) / 1e6 * 100}% ${signal.direction > 0 ? 'YES' : 'NO'})`)
console.log('Size:', signal.sizeBps, 'bps')
console.log('Block:', signal.epoch.toString())

const totalMirrored = await client.readContract({
  address: mirror,
  abi: mirrorAbi,
  functionName: 'totalMirrored',
})

console.log('\n--- Mirror Contract ---')
console.log('Total mirrored:', totalMirrored.toString())

if (totalMirrored > 0n) {
  console.log('✅ MIRROR HAS EXECUTED!')
} else {
  console.log('❌ Mirror counter still 0 - no successful executions')
}

// Check follower outcome token balances
const marketRow = await client.readContract({
  address: BINARY_MARKETS_MODULE,
  abi: marketsAbi,
  functionName: 'markets',
  args: [signal.marketId],
})

const marketAddr = marketRow[8]
const yesId = marketRow[10]
const noId = marketRow[11]

const outcomeToken = await client.readContract({
  address: marketAddr,
  abi: marketAbi,
  functionName: 'outcomeToken',
})

const [yesBalance, noBalance] = await Promise.all([
  client.readContract({ address: outcomeToken, abi: erc6909Abi, functionName: 'balanceOf', args: [follower, yesId] }),
  client.readContract({ address: outcomeToken, abi: erc6909Abi, functionName: 'balanceOf', args: [follower, noId] }),
])

console.log('\n--- Follower Outcome Tokens ---')
console.log('YES tokens:', yesBalance.toString())
console.log('NO tokens:', noBalance.toString())

if (signal.direction < 0 && noBalance > 0n) {
  console.log('✅ Follower has NO tokens - mirror worked!')
} else if (signal.direction > 0 && yesBalance > 0n) {
  console.log('✅ Follower has YES tokens - mirror worked!')
} else if (signal.direction !== 0) {
  console.log('❌ Follower has no outcome tokens - mirror failed or hasn\'t executed yet')
}
}

main().catch(console.error)
