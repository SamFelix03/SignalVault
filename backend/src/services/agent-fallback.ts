/**
 * HTTP fallbacks that mirror Somnia agent outputs when on-chain agents time out.
 * Uses the same public data sources the orchestrator targets (alternative.me, CoinGecko, CryptoCompare).
 */
import { logger } from '../utils/logger';
import { isBitcoinHeavyNews, sanitizePipelineText } from '../utils/sanitize-pipeline-text';

const CTX = 'AgentFallback';

const FNG_API = 'https://api.alternative.me/fng/?limit=1';
const COINGECKO_FUNDING_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true';
const COINDESK_RSS_URL = 'https://www.coindesk.com/arc/outboundfeeds/rss/';

export interface PipelineFallbackData {
  fearGreedIndex: number;
  fearGreedClassification: string;
  fetchedFunding: bigint;
  fundingChangePct: number;
  newsSummary: string;
  newsHeadline: string;
  newsSource: string;
  /** 0–100 parse confidence analogue */
  parseConfidence: number;
  sources: {
    fearGreed: string;
    funding: string;
    news: string;
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

/** alternative.me Fear & Greed — same target as LLM Parse Website stage */
export async function fetchFearGreedIndex(): Promise<{
  value: number;
  classification: string;
}> {
  const data = await fetchJson<{
    data?: Array<{ value?: string; value_classification?: string }>;
  }>(FNG_API);

  const row = data.data?.[0];
  if (!row?.value) throw new Error('Fear/Greed API returned no data');

  const value = Number.parseInt(row.value, 10);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    throw new Error(`Invalid Fear/Greed value: ${row.value}`);
  }

  return {
    value,
    classification: row.value_classification ?? 'Unknown',
  };
}

/** CoinGecko 24h change — same source as JSON API funding stage (8-decimal uint on-chain) */
export async function fetchFundingFromCoinGecko(): Promise<{
  raw: bigint;
  changePct: number;
}> {
  const data = await fetchJson<{ ethereum?: { usd_24h_change?: number } }>(COINGECKO_FUNDING_URL);
  const change = data.ethereum?.usd_24h_change;
  if (change == null || Number.isNaN(change)) throw new Error('CoinGecko returned no 24h change');

  const raw = BigInt(Math.round(Math.abs(change) * 1e8));
  return { raw, changePct: change };
}

const ETH_HEADLINE = /\b(ethereum|ether|eth)\b/i;
const BITCOIN_HEADLINE = /\b(bitcoin|btc)\b/i;

function parseRssItem(itemBlock: string): { headline: string; description: string } | null {
  const titleRaw = itemBlock.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/title>/i);
  const descRaw = itemBlock.match(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/description>/i);
  const headline = (titleRaw?.[1] ?? titleRaw?.[2] ?? '').trim();
  if (!headline) return null;
  const description = (descRaw?.[1] ?? descRaw?.[2] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return { headline, description };
}

function formatNewsSummary(headline: string, description: string): string {
  return description
    ? `${headline} — ${description}${description.length >= 200 ? '…' : ''}`
    : headline;
}

/** CoinDesk RSS — prefer Ethereum headlines over Bitcoin-only stories */
export async function fetchMacroNewsSummary(): Promise<{
  headline: string;
  summary: string;
  source: string;
}> {
  const res = await fetch(COINDESK_RSS_URL, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`CoinDesk RSS HTTP ${res.status}`);

  const xml = await res.text();
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  if (itemBlocks.length === 0) throw new Error('CoinDesk RSS has no items');

  let fallback: { headline: string; description: string } | null = null;

  for (const block of itemBlocks) {
    const parsed = parseRssItem(block);
    if (!parsed) continue;

    const { headline, description } = parsed;
    const ethRelated = ETH_HEADLINE.test(headline);
    const bitcoinOnly = BITCOIN_HEADLINE.test(headline) && !ethRelated;

    if (bitcoinOnly) continue;
    if (!fallback) fallback = parsed;
    if (ethRelated) {
      return {
        headline,
        summary: formatNewsSummary(headline, description),
        source: 'CoinDesk RSS (ETH)',
      };
    }
  }

  if (!fallback) throw new Error('CoinDesk RSS has no ETH-suitable headlines');
  return {
    headline: fallback.headline,
    summary: formatNewsSummary(fallback.headline, fallback.description),
    source: 'CoinDesk RSS',
  };
}

/** Replace Bitcoin-only agent headlines with ETH-focused macro news for display + fallback finalize */
export async function resolveMacroNewsSummary(raw: string): Promise<string> {
  const cleaned = sanitizePipelineText(raw);
  if (!cleaned || !isBitcoinHeavyNews(cleaned)) return cleaned;
  try {
    const eth = await fetchMacroNewsSummary();
    return eth.summary;
  } catch (err) {
    logger.warn(CTX, 'ETH news fallback failed', err);
    return cleaned;
  }
}

/**
 * Fetch all pipeline fallback inputs in parallel.
 * Partial failures degrade gracefully — each field falls back independently.
 */
export async function fetchPipelineFallbackData(): Promise<PipelineFallbackData> {
  const [fngResult, fundingResult, newsResult] = await Promise.allSettled([
    fetchFearGreedIndex(),
    fetchFundingFromCoinGecko(),
    fetchMacroNewsSummary(),
  ]);

  let fearGreedIndex = 50;
  let fearGreedClassification = 'Neutral';
  if (fngResult.status === 'fulfilled') {
    fearGreedIndex = fngResult.value.value;
    fearGreedClassification = fngResult.value.classification;
  } else {
    logger.warn(CTX, 'Fear/Greed fallback failed', fngResult.reason);
  }

  let fetchedFunding = 0n;
  let fundingChangePct = 0;
  if (fundingResult.status === 'fulfilled') {
    fetchedFunding = fundingResult.value.raw;
    fundingChangePct = fundingResult.value.changePct;
  } else {
    logger.warn(CTX, 'Funding fallback failed', fundingResult.reason);
  }

  let newsHeadline = '';
  let newsSummary = '';
  let newsSource = '';
  if (newsResult.status === 'fulfilled') {
    newsHeadline = newsResult.value.headline;
    newsSummary = newsResult.value.summary;
    newsSource = newsResult.value.source;
  } else {
    logger.warn(CTX, 'News fallback failed', newsResult.reason);
    newsSummary = `${fearGreedClassification} (Fear/Greed ${fearGreedIndex}/100). ETH 24h: ${fundingChangePct >= 0 ? '+' : ''}${fundingChangePct.toFixed(2)}%.`;
  }

  const okCount = [fngResult, fundingResult, newsResult].filter((r) => r.status === 'fulfilled').length;
  const parseConfidence = Math.round((okCount / 3) * 100);

  logger.info(CTX, 'Pipeline fallback fetched', {
    fearGreedIndex,
    fearGreedClassification,
    fundingChangePct,
    newsHeadline: newsHeadline.slice(0, 80),
    parseConfidence,
  });

  return {
    fearGreedIndex,
    fearGreedClassification,
    fetchedFunding,
    fundingChangePct,
    newsSummary,
    newsHeadline,
    newsSource,
    parseConfidence,
    sources: {
      fearGreed: FNG_API,
      funding: COINGECKO_FUNDING_URL,
      news: COINDESK_RSS_URL,
    },
  };
}
