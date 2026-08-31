import 'dotenv/config';
import { createMarketsExchange } from '../src/services/markets-exchange';
import { isSpotMarket } from '@somnia-chain/markets-sdk';

async function main() {
  const exchange = await createMarketsExchange();
  const all = Object.values(await exchange.loadMarkets(true));
  const spots = all.filter((m) => m.active && isSpotMarket(m.info));
  console.log(`active spot markets: ${spots.length}`);
  for (const m of spots) {
    console.log(`  ${m.symbol} pool=${m.info.poolAddress}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
