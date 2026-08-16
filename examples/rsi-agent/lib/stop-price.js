/**
 * On-chain stopPrice is USD cents (2 decimals), matching AgentOrchestrator.
 */

export function deriveStopPriceCents(directionNum, priceCents) {
  const price = Number(priceCents)
  if (!Number.isFinite(price) || price <= 0) return 0n
  if (directionNum > 0) return BigInt(Math.round((price * 97) / 100))
  if (directionNum < 0) return BigInt(Math.round((price * 103) / 100))
  return BigInt(price)
}

/**
 * Coerce LLM / legacy values into USD cents.
 * Values under 100_000 are treated as whole dollars (e.g. 1860 → 186000).
 */
export function normalizeStopPriceCents(raw, priceCents, directionNum = 0) {
  let n = typeof raw === 'bigint' ? Number(raw) : Number(raw)
  if (!Number.isFinite(n) || n < 0) n = 0

  if (n > 0 && n < 100_000) {
    n = Math.round(n * 100)
  }

  if (n <= 0 && priceCents > 0n) {
    return deriveStopPriceCents(directionNum, priceCents)
  }

  const expected = deriveStopPriceCents(directionNum, priceCents)
  if (directionNum !== 0 && expected > 0n) {
    const expectedNum = Number(expected)
    if (n < expectedNum * 0.5 || n > expectedNum * 1.5) {
      return expected
    }
  }

  return BigInt(n)
}
