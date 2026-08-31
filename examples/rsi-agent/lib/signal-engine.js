/**
 * Rule-based inference — ports AgentOrchestrator._deriveRuleBasedSignal (fallback path).
 */
import { formatUsdCents } from './pipeline-context.js'

function dirLabel(d, instrument = 'binary') {
  if (d > 0) return instrument === 'perp' ? 'LONG' : 'UP'
  if (d < 0) return instrument === 'perp' ? 'SHORT' : 'DOWN'
  return 'FLAT'
}

/**
 * Same logic as contracts/src/core/AgentOrchestrator.sol _deriveRuleBasedSignal
 */
export function deriveRuleBasedSignal(ctx, { instrument = 'binary' } = {}) {
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

  const reasoning = [
    `ETH ${formatUsdCents(price)}`,
    `Fear/Greed ${ctx.fearGreedIndex}/100`,
    ctx.newsSummary,
  ].join(', ')

  const decisionNote =
    direction > 0
      ? ctx.fearGreedIndex < 30
        ? instrument === 'perp'
          ? 'Extreme fear — accumulate LONG'
          : 'Extreme fear — accumulate UP'
        : instrument === 'perp'
          ? 'Neutral-bullish macro — maintain LONG exposure'
          : 'Neutral-bullish macro — maintain UP exposure'
      : ctx.fearGreedIndex > 70
        ? instrument === 'perp'
          ? 'Extreme greed — reduce risk, SHORT bias'
          : 'Extreme greed — reduce risk, DOWN bias'
        : instrument === 'perp'
          ? 'Elevated funding — SHORT bias'
          : 'Elevated funding — DOWN bias'

  return {
    direction: dirLabel(direction, instrument),
    directionNum: direction,
    sizeBps,
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
