/**
 * Phase 0 spike: verify Shannon testnet perp availability.
 *
 *   npx tsx scripts/spike-perp-testnet.ts
 *   npx tsx scripts/spike-perp-testnet.ts --trade   # needs PRIVATE_KEY + funded wallet
 */
import 'dotenv/config';
import { createPublicClient, http, type Address } from 'viem';
import { createMarketsExchange } from '../src/services/markets-exchange';
import { RPC_URL } from '../src/config/constants';
import { somniaTestnet } from '../src/config/chains';

const DREAMDEX_TESTNET_API = 'https://stg.api.dreamdex.io';

async function fetchDreamdexPerpMarkets() {
  const url = `${DREAMDEX_TESTNET_API}/v0/markets?kind=perp`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, url, body };
}

async function main() {
  const doTrade = process.argv.includes('--trade');
  const pk = process.env.PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY;

  console.log('=== SignalVault perp testnet spike ===\n');

  console.log('1) dreamDEX HTTP GET /v0/markets?kind=perp');
  const httpResult = await fetchDreamdexPerpMarkets();
  const httpMarkets = Array.isArray((httpResult.body as { markets?: unknown[] })?.markets)
    ? (httpResult.body as { markets: unknown[] }).markets
    : [];
  console.log('   status:', httpResult.status);
  console.log('   count:', httpMarkets.length);
  if (httpMarkets[0]) {
    console.log('   sample:', JSON.stringify(httpMarkets[0], null, 2).slice(0, 500));
  }
  console.log();

  console.log('2) markets-sdk loadMarkets (perp filter)');
  const t0 = Date.now();
  const exchange = await createMarketsExchange(doTrade && pk ? { privateKey: pk } : undefined);
  const { isPerpMarket } = await import('@somnia-chain/markets-sdk');
  const all = Object.values(await exchange.loadMarkets(true));
  const perps = all.filter((m) => m.active && isPerpMarket(m.info));
  console.log(`   loadMarkets: ${Date.now() - t0}ms — total ${all.length}, active perps ${perps.length}`);
  for (const m of perps.slice(0, 8)) {
    console.log(`   - ${m.symbol} pool=${m.info.poolAddress}`);
  }
  console.log();

  console.log('3) on-chain listTradeablePerpPools');
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  if (perps.length > 0) {
    try {
      const samplePool = perps[0].info.poolAddress as Address;
      const marginBank = await publicClient.readContract({
        address: samplePool,
        abi: [
          {
            type: 'function',
            name: 'marginBank',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'address' }],
          },
        ] as const,
        functionName: 'marginBank',
      });
      console.log(`   marginBank=${marginBank} (from pool ${samplePool})`);
      console.log(`   active perp pools from indexer: ${perps.length}`);
    } catch (err) {
      console.log('   on-chain registry failed:', err instanceof Error ? err.message : String(err));
    }
  } else {
    console.log('   skipped — no perp markets from indexer');
  }
  console.log();

  const httpCount = httpMarkets.length;
  const verdict =
    perps.length > 0 || httpCount > 0
      ? 'PERPS_LISTED — testnet has perp market metadata'
      : 'NO_PERPS_LISTED — neither HTTP API nor indexer returned perp markets';
  console.log('VERDICT:', verdict);

  if (!doTrade) {
    console.log('\nPass --trade to attempt depositMargin + IOC long (needs PRIVATE_KEY).');
    return;
  }

  if (!pk) {
    console.error('\n--trade requires PRIVATE_KEY or RELAYER_PRIVATE_KEY in backend/.env');
    process.exit(1);
  }

  if (perps.length === 0) {
    console.error('\nCannot trade — no perp markets found.');
    process.exit(1);
  }

  const target =
    perps.find((m) => m.symbol.startsWith('XRP/')) ??
    perps.find((m) => m.symbol.startsWith('ADA/')) ??
    perps.find((m) => m.symbol.includes('ETH')) ??
    perps[0];
  const skipDeposit = process.argv.includes('--skip-deposit');
  const marginDeposit = Number(process.env.PERP_MARGIN_DEPOSIT ?? '0.05');
  console.log(`\n4) Attempt trade on ${target.symbol} (margin deposit ${skipDeposit ? 'skipped' : marginDeposit} USDso) ...`);
  console.log('   Note: perp margin uses USDso (18dp), not tUSDC — fund USDso for MarginBank.');

  try {
    if (!skipDeposit) {
      console.log(`   depositMargin(${marginDeposit}) ...`);
      await exchange.depositMargin(target.symbol, marginDeposit);
    } else {
      console.log('   depositMargin skipped (--skip-deposit)');
    }

    const book = await exchange.fetchOrderBook(target.symbol, 3);
    const ask = book.asks[0]?.[0];
    const price = ask !== undefined ? ask * 1.02 : undefined;
    const lotMin = target.symbol.startsWith('XRP/') || target.symbol.startsWith('ADA/') ? 1 : 0.01;
    console.log(`   createOrder market buy qty=${lotMin} bestAsk=${ask} ...`);

    const order = await exchange.createOrder(target.symbol, 'market', 'buy', lotMin, price, {
      timeInForce: 'IOC',
      slippage: 0.05,
    });

    const receipt = (order.info as { receipt?: { transactionHash?: string } })?.receipt;
    console.log('   TRADE_OK tx:', receipt?.transactionHash ?? '(see order.info)');
    console.log('\nVERDICT: PERPS_TRADEABLE on Shannon testnet');
  } catch (err) {
    console.error('   TRADE_FAILED:', err instanceof Error ? err.message : String(err));
    console.log('\nVERDICT: PERPS_LISTED but trade failed — check margin, leverage, pool status');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('SPIKE_FATAL', e);
  process.exit(1);
});
