import { TUSDC_DECIMALS } from '@/lib/constants'

const DEFAULT_TICK_18 = BigInt('1000000000000000')

export function defaultTickForDecimals(collateralDecimals = TUSDC_DECIMALS): bigint {
  if (collateralDecimals <= 6) return BigInt(1000)
  return DEFAULT_TICK_18
}

export function encodeLimitPrice(probability: number, collateralDecimals = TUSDC_DECIMALS): bigint {
  const clamped = Math.min(1, Math.max(0, probability))
  const scale = BigInt(10) ** BigInt(collateralDecimals)
  return BigInt(Math.round(clamped * Number(scale)))
}

export function decodeLimitPrice(scaled: bigint, collateralDecimals = TUSDC_DECIMALS): number {
  const scale = BigInt(10) ** BigInt(collateralDecimals)
  return Number(scaled) / Number(scale)
}

export function snapToTickGrid(
  probability: number,
  collateralDecimals = TUSDC_DECIMALS,
  tickSize: bigint = defaultTickForDecimals(collateralDecimals),
): bigint {
  const scaled = encodeLimitPrice(probability, collateralDecimals)
  if (scaled === BigInt(0)) return BigInt(0)
  const snapped = (scaled / tickSize) * tickSize
  return snapped > BigInt(0) ? snapped : tickSize
}
