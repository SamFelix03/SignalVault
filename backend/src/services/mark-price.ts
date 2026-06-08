import { parseAbi } from 'viem';
import { publicClient, config } from '../config/chains';
import { logger } from '../utils/logger';

const CTX = 'MarkPrice';
const oracleAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

/** Chainlink-style 8-decimal USD answer → cents (2 decimals), matching AgentOrchestrator. */
export function oracleAnswerToCents(answer: bigint): number {
  if (answer <= 0n) return 0;
  return Number(answer / 1_000_000n);
}

export async function fetchEthUsdCents(): Promise<number> {
  try {
    const [, answer] = await publicClient.readContract({
      address: config.ethUsdOracle,
      abi: oracleAbi,
      functionName: 'latestRoundData',
    }) as [bigint, bigint, bigint, bigint, bigint];

    const cents = oracleAnswerToCents(answer);
    if (cents <= 0) throw new Error('invalid oracle answer');
    return cents;
  } catch (err) {
    logger.warn(CTX, 'Oracle read failed, using dreamDEX mid fallback', err);
    return fetchDreamDexEthMidCents();
  }
}

async function fetchDreamDexEthMidCents(): Promise<number> {
  const res = await fetch(
    'https://stg.api.dreamdex.io/v0/orderbooks?symbols=WETH%3AUSDso&depth=1',
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`dreamDEX orderbook: ${res.status}`);
  const data = await res.json() as {
    orderbooks?: Array<{ bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }>;
  };
  const book = data.orderbooks?.[0];
  const bid = parseFloat(book?.bids?.[0]?.price ?? '0');
  const ask = parseFloat(book?.asks?.[0]?.price ?? '0');
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask;
  if (mid <= 0) throw new Error('no WETH mid price');
  return Math.round(mid * 100);
}
