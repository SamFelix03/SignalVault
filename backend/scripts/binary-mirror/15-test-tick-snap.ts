#!/usr/bin/env npx tsx
/**
 * 15 — Test tick snapping math directly.
 */
import 'dotenv/config'

function snapToTick(price: bigint, decimals: number): bigint {
  const tick = decimals <= 6 ? 1000n : 1_000_000_000_000_000n
  if (price === 0n) return 0n
  return (price / tick) * tick
}

function applySlippageAndSnap(price: bigint, slippageBps: number, decimals: number): bigint {
  if (slippageBps === 0) return price
  const adj = (price * BigInt(slippageBps)) / 10_000n
  const adjusted = price + adj
  return snapToTick(adjusted, decimals)
}

console.log('Testing tick snapping with current signal')
console.log('==========================================')

const signalLimit = 364000n
const slippageBps = 300
const decimals = 6

console.log('Signal limit:', signalLimit.toString(), `(${Number(signalLimit) / 1e6 * 100}% NO)`)
console.log('Slippage:', slippageBps, 'bps')

const rawAdjustment = (signalLimit * BigInt(slippageBps)) / 10_000n
console.log('Raw adjustment:', rawAdjustment.toString())

const beforeSnap = signalLimit + rawAdjustment
console.log('Before snap:', beforeSnap.toString(), `(${Number(beforeSnap) / 1e6 * 100}%)`)

const afterSnap = snapToTick(beforeSnap, decimals)
console.log('After snap:', afterSnap.toString(), `(${Number(afterSnap) / 1e6 * 100}%)`)

const execPrice = applySlippageAndSnap(signalLimit, slippageBps, decimals)
console.log('\nFinal exec price:', execPrice.toString())
console.log('Is tick-aligned?', execPrice % 1000n === 0n ? '✅ YES' : '❌ NO')
console.log('Tick-aligned value:', (execPrice / 1000n).toString(), '* 1000')
