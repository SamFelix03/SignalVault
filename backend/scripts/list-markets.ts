import { createMarketsExchange } from '../src/services/markets-exchange.js';

async function main() {
  const { isBinaryMarket } = await import('@somnia-chain/markets-sdk');
  const ex = await createMarketsExchange();
  const markets = Object.values(await ex.loadMarkets(true));
  const binary = markets.filter((m) => m.active && isBinaryMarket(m.info));
  console.log('total', markets.length, 'active binary', binary.length);
  for (const m of binary.slice(0, 3)) {
    console.log('-', m.symbol, '|', m.outcomes?.[0]?.symbol, '|', m.info.question?.slice(0, 50));
  }
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
