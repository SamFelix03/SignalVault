/**
 * Compute Wilder's RSI from an array of closing prices (oldest → newest).
 */
export function computeRsi(closes, period = 14) {
  if (closes.length < period + 1) {
    throw new Error(`Need at least ${period + 1} closes for RSI(${period})`)
  }

  let avgGain = 0
  let avgLoss = 0

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }

  avgGain /= period
  avgLoss /= period

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Simple EMA for trend confirmation.
 */
export function computeEma(values, period) {
  if (values.length < period) throw new Error('Not enough values for EMA')
  const k = 2 / (period + 1)
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
  }
  return ema
}
