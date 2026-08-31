const DEFAULT_TICK_18 = 1_000_000_000_000_000n

/** Tick grid for binary limit prices — must match dreamDEX pool granularity. */
export function defaultTickForDecimals(collateralDecimals: number): bigint {
  if (collateralDecimals <= 6) return 1_000n // 0.001 probability step at 6 decimals
  return DEFAULT_TICK_18
}

export function encodeLimitPrice(probability: number, collateralDecimals: number): bigint {
  const clamped = Math.min(1, Math.max(0, probability))
  const scale = 10n ** BigInt(collateralDecimals)
  return BigInt(Math.round(clamped * Number(scale)))
}

export function decodeLimitPrice(scaled: bigint, collateralDecimals: number): number {
  const scale = 10n ** BigInt(collateralDecimals)
  return Number(scaled) / Number(scale)
}

export function snapToTickGrid(
  probability: number,
  collateralDecimals: number,
  tickSize: bigint = defaultTickForDecimals(collateralDecimals),
): bigint {
  const scaled = encodeLimitPrice(probability, collateralDecimals)
  if (scaled === 0n) return 0n
  const snapped = (scaled / tickSize) * tickSize
  return snapped > 0n ? snapped : tickSize
}
