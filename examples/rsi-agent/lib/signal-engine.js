/**
 * Rule-based inference — ports AgentOrchestrator._deriveRuleBasedSignal (fallback path).
 */
import { formatUsdCents } from './pipeline-context.js'
import { deriveStopPriceCents } from './stop-price.js'

function dirLabel(d) {
  if (d > 0) return 'LONG'
  if (d < 0) return 'SHORT'
  return 'FLAT'
}

/**
 * Same logic as contracts/src/core/AgentOrchestrator.sol _deriveRuleBasedSignal
 */
export function deriveRuleBasedSignal(ctx) {
  let direction = 1
  let sizeBps = 1000

  if (ctx.fearGreedIndex < 30) {
    direction = 1
    sizeBps = 2000
  } else if (ctx.fearGreedIndex > 70) {
    direction = -1
    sizeBps = 1500
  } else {
    direction = 1
    sizeBps = 1000
  }

  // Native: high funding magnitude vs price → lean short
  if (ctx.fetchedFunding > 0n && ctx.fetchedFunding > BigInt(Math.floor(ctx.fetchedPrice / 20))) {
    direction = -1
    sizeBps = 1200
  }

  const price = ctx.fetchedPrice
  const stopPrice = deriveStopPriceCents(direction, price)

  const reasoning = [
    `ETH ${formatUsdCents(price)}`,
    `Fear/Greed ${ctx.fearGreedIndex}/100`,
    ctx.newsSummary,
  ].join(', ')

  const decisionNote =
    direction > 0
      ? ctx.fearGreedIndex < 30
        ? 'Extreme fear — accumulate long'
        : 'Neutral-bullish macro — maintain long exposure'
      : ctx.fearGreedIndex > 70
        ? 'Extreme greed — reduce risk, short bias'
        : 'Elevated funding — short bias'

  return {
    direction: dirLabel(direction),
    directionNum: direction,
    sizeBps,
    stopPrice: BigInt(stopPrice),
    reason: `${reasoning}. ${decisionNote}.`,
    inferenceMode: 'rules',
  }
}

export function signalChanged(previous, next) {
  if (!previous) return true
  return (
    previous.directionNum !== next.directionNum ||
    previous.sizeBps !== next.sizeBps
  )
}
