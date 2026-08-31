import { createMarketsExchange } from './markets-exchange';
import { logger } from '../utils/logger';

const CTX = 'MarketsCatalog';
const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { at: number; data: T };

let binaryCache: CacheEntry<unknown> | null = null;
let perpCache: CacheEntry<unknown> | null = null;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const t0 = Date.now();
    const { isBinaryMarket, isPerpMarket } = await import('@somnia-chain/markets-sdk');
    const exchange = await createMarketsExchange();
    const markets = Object.values(await exchange.loadMarkets(true));

    const binaryRows: Array<{
      marketId: string;
      symbol: string;
      yesSymbol: string;
      noSymbol: string;
      title: string;
      status: number | null;
      trading: boolean;
    }> = [];

    const perpRows: Array<{
      pool: string;
      symbol: string;
      base: string;
      markPrice: number | null;
      minLot: number;
      quoteDecimals: number;
      trading: boolean;
    }> = [];

    for (const m of markets) {
      if (!m.active) continue;

      if (isBinaryMarket(m.info)) {
        const marketId = m.info.marketId as string;
        const yesSymbol = m.outcomes?.[0]?.symbol;
        const noSymbol = m.outcomes?.[1]?.symbol;
        if (!yesSymbol || !noSymbol) continue;

        let status: number | null = null;
        try {
          const onchain = await exchange.client.getMarketOnchain(marketId as `0x${string}`);
          status = Number(onchain.status);
        } catch {
          status = null;
        }

        binaryRows.push({
          marketId,
          symbol: m.symbol,
          yesSymbol,
          noSymbol,
          title: m.info.question ?? m.symbol,
          status,
          trading: status === 1,
        });
        continue;
      }

      if (isPerpMarket(m.info)) {
        let markPrice: number | null = null;
        try {
          const book = await exchange.fetchOrderBook(m.symbol, 1);
          markPrice = book.asks[0]?.[0] ?? book.bids[0]?.[0] ?? null;
        } catch {
          markPrice = null;
        }

        const lotMin =
          m.symbol.startsWith('XRP/') || m.symbol.startsWith('ADA/') ? 1 : 0.01;

        perpRows.push({
          pool: m.info.poolAddress as string,
          symbol: m.symbol,
          base: m.info.baseSymbol ?? m.symbol.split('/')[0] ?? m.symbol,
          markPrice,
          minLot: lotMin,
          quoteDecimals: m.info.quoteDecimals ?? 18,
          trading: true,
        });
      }
    }

    binaryRows.sort((a, b) => Number(b.trading) - Number(a.trading));
    perpRows.sort((a, b) => a.symbol.localeCompare(b.symbol));

    binaryCache = { at: Date.now(), data: binaryRows };
    perpCache = { at: Date.now(), data: perpRows };
    logger.info(CTX, `Catalog refreshed in ${Date.now() - t0}ms`, {
      binary: binaryRows.length,
      perps: perpRows.length,
    });
    loadPromise = null;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

function isFresh(entry: CacheEntry<unknown> | null): boolean {
  return entry !== null && Date.now() - entry.at < CACHE_TTL_MS;
}

export async function getBinaryMarketsCatalog() {
  if (!isFresh(binaryCache)) await ensureLoaded();
  return (binaryCache?.data ?? []) as Array<{
    marketId: string;
    symbol: string;
    yesSymbol: string;
    noSymbol: string;
    title: string;
    status: number | null;
    trading: boolean;
  }>;
}

export async function getPerpMarketsCatalog() {
  if (!isFresh(perpCache)) await ensureLoaded();
  return (perpCache?.data ?? []) as Array<{
    pool: string;
    symbol: string;
    base: string;
    markPrice: number | null;
    minLot: number;
    quoteDecimals: number;
    trading: boolean;
  }>;
}

export async function warmMarketsCatalog(): Promise<void> {
  await ensureLoaded();
}
