const FNG_API = 'https://api.alternative.me/fng/?limit=1'
const COINGECKO_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true'
const COINGECKO_CHART_URL =
  'https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=2'
const DREAMDEX_ORDERBOOK_URL =
  'https://stg.api.dreamdex.io/v0/orderbooks?symbols=WETH%3AUSDso&depth=1'

const ETH_USD_ORACLE = '0xd9132c1d762D432672493F640a63B758891B449e'

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export async function fetchFearGreed() {
  const data = await fetchJson(FNG_API)
  const row = data.data?.[0]
  const value = Number.parseInt(row?.value ?? '', 10)
  if (Number.isNaN(value)) throw new Error('Fear/Greed unavailable')
  return {
    value,
    classification: row?.value_classification ?? 'Unknown',
  }
}

export async function fetchEthSpotAndChange() {
  const data = await fetchJson(COINGECKO_PRICE_URL)
  const usd = Number(data.ethereum?.usd)
  const change24h = Number(data.ethereum?.usd_24h_change ?? 0)
  if (!usd || Number.isNaN(usd)) throw new Error('CoinGecko spot price unavailable')
  return { usd, change24h }
}

/** Hourly closes for RSI — last ~48 points from 2-day chart. */
export async function fetchEthHourlyCloses() {
  const data = await fetchJson(COINGECKO_CHART_URL)
  const prices = data.prices ?? []
  if (prices.length < 20) throw new Error('Not enough price history for RSI')

  const hourly = []
  let bucket = null
  for (const [ts, price] of prices) {
    const hour = Math.floor(ts / 3_600_000)
    if (bucket === null || bucket.hour !== hour) {
      if (bucket) hourly.push(bucket.close)
      bucket = { hour, close: price }
    } else {
      bucket.close = price
    }
  }
  if (bucket) hourly.push(bucket.close)
  return hourly
}

export async function fetchDreamDexMidUsd() {
  const data = await fetchJson(DREAMDEX_ORDERBOOK_URL)
  const book = data.orderbooks?.[0]
  const bid = Number.parseFloat(book?.bids?.[0]?.price ?? '0')
  const ask = Number.parseFloat(book?.asks?.[0]?.price ?? '0')
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask
  if (!mid || mid <= 0) throw new Error('dreamDEX mid unavailable')
  return mid
}

export async function fetchOracleCents(publicClient) {
  const [, answer] = await publicClient.readContract({
    address: ETH_USD_ORACLE,
    abi: [
      {
        type: 'function',
        name: 'latestRoundData',
        inputs: [],
        outputs: [
          { type: 'uint80' },
          { type: 'int256' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'uint80' },
        ],
        stateMutability: 'view',
      },
    ],
    functionName: 'latestRoundData',
  })

  const cents = Number(answer > 0n ? answer / 1_000_000n : 0n)
  if (cents <= 0) throw new Error('Oracle returned invalid price')
  return cents
}

/**
 * Best-effort ETH USD price in cents — dreamDEX mid preferred, oracle fallback.
 */
export async function fetchEthPriceCents(publicClient) {
  try {
    const mid = await fetchDreamDexMidUsd()
    return Math.round(mid * 100)
  } catch {
    return fetchOracleCents(publicClient)
  }
}

export async function fetchMarketSnapshot(publicClient) {
  const [fng, spot, closes, priceCents] = await Promise.all([
    fetchFearGreed(),
    fetchEthSpotAndChange(),
    fetchEthHourlyCloses(),
    fetchEthPriceCents(publicClient),
  ])

  return {
    fearGreed: fng.value,
    fearGreedClass: fng.classification,
    change24h: spot.change24h,
    spotUsd: spot.usd,
    closes,
    priceCents,
  }
}
