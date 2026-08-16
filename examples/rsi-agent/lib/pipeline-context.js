/**
 * Same public data sources as SignalVault's AgentOrchestrator + backend agent-fallback.
 * Stages: oracle price → funding → fear/greed → macro news
 */
import { fetchOracleCents } from './market-data.js'

const FNG_API = 'https://api.alternative.me/fng/?limit=1'
const COINGECKO_FUNDING_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true'
const COINDESK_RSS_URL = 'https://www.coindesk.com/arc/outboundfeeds/rss/'

const ETH_HEADLINE = /\b(ethereum|ether|eth)\b/i
const BITCOIN_HEADLINE = /\b(bitcoin|btc)\b/i

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function parseRssItem(itemBlock) {
  const titleRaw = itemBlock.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/title>/i)
  const descRaw = itemBlock.match(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/description>/i)
  const headline = (titleRaw?.[1] ?? titleRaw?.[2] ?? '').trim()
  if (!headline) return null
  const description = (descRaw?.[1] ?? descRaw?.[2] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return { headline, description }
}

async function fetchMacroNewsSummary() {
  const res = await fetch(COINDESK_RSS_URL, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`CoinDesk RSS HTTP ${res.status}`)

  const xml = await res.text()
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []
  if (itemBlocks.length === 0) throw new Error('CoinDesk RSS has no items')

  let fallback = null
  for (const block of itemBlocks) {
    const parsed = parseRssItem(block)
    if (!parsed) continue
    const { headline, description } = parsed
    const ethRelated = ETH_HEADLINE.test(headline)
    const bitcoinOnly = BITCOIN_HEADLINE.test(headline) && !ethRelated
    if (bitcoinOnly) continue
    if (!fallback) fallback = parsed
    if (ethRelated) {
      const summary = description
        ? `${headline} — ${description}${description.length >= 200 ? '…' : ''}`
        : headline
      return { headline, summary, source: 'CoinDesk RSS (ETH)' }
    }
  }

  if (!fallback) throw new Error('CoinDesk RSS has no ETH-suitable headlines')
  const summary = fallback.description
    ? `${fallback.headline} — ${fallback.description}`
    : fallback.headline
  return { headline: fallback.headline, summary, source: 'CoinDesk RSS' }
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n)
}

function formatUsdCents(cents) {
  return `$${Math.floor(cents / 100)}.${pad2(cents % 100)}`
}

/**
 * Run the same 4 fetch stages as the on-chain pipeline (HTTP equivalents of Somnia agents).
 */
export async function fetchPipelineContext(publicClient) {
  const stages = []

  // Stage 1 — Oracle price (Chainlink on Somnia, same as AgentOrchestrator._bootstrapOraclePrice)
  const fetchedPrice = await fetchOracleCents(publicClient)
  stages.push({
    id: 'price',
    label: 'Fetching Price',
    detail: `ETH oracle ${formatUsdCents(fetchedPrice)}`,
  })

  // Stage 2 — Funding / 24h change (CoinGecko, same as JSON API agent target)
  let fundingChangePct = 0
  let fetchedFunding = 0n
  try {
    const data = await fetchJson(COINGECKO_FUNDING_URL)
    const change = Number(data.ethereum?.usd_24h_change ?? 0)
    if (Number.isNaN(change)) throw new Error('no 24h change')
    fundingChangePct = change
    fetchedFunding = BigInt(Math.round(Math.abs(change) * 1e8))
    stages.push({
      id: 'funding',
      label: 'Fetching Funding',
      detail: `ETH 24h ${change >= 0 ? '+' : ''}${change.toFixed(2)}% (raw ${fetchedFunding})`,
    })
  } catch (err) {
    stages.push({
      id: 'funding',
      label: 'Fetching Funding',
      detail: `unavailable: ${err.message}`,
      warn: true,
    })
  }

  // Stage 3 — Fear & Greed (alternative.me, same as LLM Parse Website stage target)
  let fearGreedIndex = 50
  let fearGreedClassification = 'Neutral'
  try {
    const data = await fetchJson(FNG_API)
    const row = data.data?.[0]
    fearGreedIndex = Number.parseInt(row?.value ?? '50', 10)
    fearGreedClassification = row?.value_classification ?? 'Unknown'
    stages.push({
      id: 'fearGreed',
      label: 'Parsing Fear & Greed',
      detail: `${fearGreedIndex}/100 (${fearGreedClassification})`,
    })
  } catch (err) {
    stages.push({
      id: 'fearGreed',
      label: 'Parsing Fear & Greed',
      detail: `fallback 50: ${err.message}`,
      warn: true,
    })
  }

  // Stage 4 — Macro news (CoinDesk RSS, same as backend agent-fallback)
  let newsSummary = ''
  let newsHeadline = ''
  try {
    const news = await fetchMacroNewsSummary()
    newsHeadline = news.headline
    newsSummary = news.summary
    stages.push({
      id: 'news',
      label: 'Parsing News',
      detail: news.headline.slice(0, 80) + (news.headline.length > 80 ? '…' : ''),
    })
  } catch (err) {
    newsSummary = `${fearGreedClassification} (Fear/Greed ${fearGreedIndex}/100). ETH 24h: ${fundingChangePct >= 0 ? '+' : ''}${fundingChangePct.toFixed(2)}%.`
    stages.push({
      id: 'news',
      label: 'Parsing News',
      detail: `synthetic macro context`,
      warn: true,
    })
  }

  return {
    fetchedPrice,
    fetchedFunding,
    fundingChangePct,
    fearGreedIndex,
    fearGreedClassification,
    newsSummary,
    newsHeadline,
    stages,
  }
}

export { formatUsdCents, pad2 }
