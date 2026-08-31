/**
 * Swap STT → USDso on spot (SOMI/USDso), deposit perp margin, open a small long.
 *
 *   npx tsx scripts/fund-and-perp-trade.ts
 *
 * Env: PRIVATE_KEY or RELAYER_PRIVATE_KEY, optional STT_SELL_AMOUNT, PERP_MARGIN_DEPOSIT, PERP_LEVERAGE
 */
import 'dotenv/config';
import { createMarketsExchange } from '../src/services/markets-exchange';
import { isPerpMarket, isSpotMarket } from '@somnia-chain/markets-sdk';
import type { Address } from 'viem';

const SPOT_SYMBOL = 'SOMI/USDso';
const GAS_RESERVE_STT = Number(process.env.GAS_RESERVE_STT ?? '2');
const TARGET_USDSO = Number(process.env.TARGET_USDSO ?? '5');

function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}

async function main() {
  const pk = process.env.PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY;
  if (!pk) {
    console.error('PRIVATE_KEY or RELAYER_PRIVATE_KEY required in backend/.env');
    process.exit(1);
  }

  log('0', 'Creating exchange client…');
  const exchange = await createMarketsExchange({ privateKey: pk });

  log('1', 'Loading markets from indexer (~60–90s on testnet)…');
  const t0 = Date.now();
  const all = Object.values(await exchange.loadMarkets(true));
  log('1', `loadMarkets done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${all.length} markets`);

  const spot = all.find((m) => m.active && m.symbol === SPOT_SYMBOL && isSpotMarket(m.info));
  if (!spot) {
    console.error(`Spot market ${SPOT_SYMBOL} not found`);
    process.exit(1);
  }

  const perps = all.filter((m) => m.active && isPerpMarket(m.info));
  const perp =
    perps.find((m) => m.symbol.startsWith('XRP/')) ??
    perps.find((m) => m.symbol.startsWith('ADA/')) ??
    perps[0];
  if (!perp) {
    console.error('No active perp markets');
    process.exit(1);
  }

  log('2', 'Fetching wallet balances…');
  const bal = await exchange.fetchBalance();
  const stt = bal.STT?.total ?? 0;
  const usdsoBefore = bal.USDso?.total ?? 0;
  log('2', `STT=${stt.toFixed(4)}  USDso=${usdsoBefore.toFixed(6)}`);

  let usdso = usdsoBefore;
  if (usdso < TARGET_USDSO) {
    const sellAmount =
      process.env.STT_SELL_AMOUNT !== undefined
        ? Number(process.env.STT_SELL_AMOUNT)
        : Math.max(0, stt - GAS_RESERVE_STT);
    if (sellAmount <= 0) {
      console.error(`Not enough STT to swap (have ${stt}, reserve ${GAS_RESERVE_STT} for gas)`);
      process.exit(1);
    }
    log('3', `Market-sell ${sellAmount} STT on ${SPOT_SYMBOL} for USDso…`);
    const spotOrder = await exchange.createOrder(SPOT_SYMBOL, 'market', 'sell', sellAmount, undefined, {
      slippage: 0.03,
      timeInForce: 'IOC',
    });
    log('3', `Spot fill: status=${spotOrder.status} filled=${spotOrder.filled} tx=${spotOrder.txHash}`);

    const balAfter = await exchange.fetchBalance();
    usdso = balAfter.USDso?.total ?? 0;
    log('3', `USDso after swap: ${usdso.toFixed(6)}`);
  } else {
    log('3', `Already have ${usdso.toFixed(6)} USDso — skipping spot swap`);
  }

  const marginDeposit = Math.min(
    Number(process.env.PERP_MARGIN_DEPOSIT ?? String(Math.max(0.5, usdso * 0.85))),
    Math.max(0, usdso - 0.01),
  );
  if (marginDeposit <= 0) {
    console.error('No USDso available for margin deposit');
    process.exit(1);
  }

  const leverage = Number(process.env.PERP_LEVERAGE ?? '10');
  const pool = perp.info.poolAddress as Address;

  log('4', `setPerpLeverage ${leverage}x on ${perp.symbol}…`);
  try {
    await exchange.trader.setPerpLeverage({ pool, leverageX: leverage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('NoStateChange')) throw e;
    log('4', `Leverage already ${leverage}x — skipping`);
  }

  log('5', `depositMargin ${marginDeposit} USDso…`);
  const dep = await exchange.depositMargin(perp.symbol, marginDeposit);
  log('5', `Deposit tx: ${dep.hash}`);

  const lotMin = perp.symbol.startsWith('XRP/') || perp.symbol.startsWith('ADA/') ? 1 : 0.01;
  const book = await exchange.fetchOrderBook(perp.symbol, 3);
  const ask = book.asks[0]?.[0];
  log('6', `Market buy ${lotMin} ${perp.symbol} (best ask ${ask})…`);

  const order = await exchange.createOrder(perp.symbol, 'market', 'buy', lotMin, undefined, {
    slippage: 0.05,
    timeInForce: 'IOC',
  });
  log('6', `Perp order: status=${order.status} filled=${order.filled} tx=${order.txHash}`);
  console.log('\nDONE — STT→USDso→margin→perp long completed');
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
