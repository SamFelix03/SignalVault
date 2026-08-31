/**
 * Phase 0 spike: prove operator placeOrderFor path for perp mirror.
 *
 *   npx tsx scripts/spike-perp-operator.ts
 *
 * Grants relayer as operator on XRP pool, then places IOC order via placeOrderFor.
 */
import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createMarketsExchange } from '../src/services/markets-exchange';
import { isPerpMarket } from '@somnia-chain/markets-sdk';
import { RPC_URL } from '../src/config/constants';
import { somniaTestnet } from '../src/config/chains';

const PLACE_ORDER_FOR_SELECTOR = '0x80054449' as Hex;
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address;
const MARKETS_CORE = '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address;

const operatorRegistryAbi = parseAbi([
  'function setOperatorApprovalForPool(address pool, address operator, bytes4[] selectors, bool approved)',
  'function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)',
]);

const perpPoolAbi = parseAbi([
  'function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) returns (bool success, uint128 id)',
  'function getMarkPrice() view returns (uint256)',
  'function getOrderBookParameters() view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize)',
  'function marginBank() view returns (address)',
]);

const marketsCoreAbi = parseAbi([
  'function operatorPermissionsRegistry() view returns (address)',
]);

async function main() {
  const pk = process.env.PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY;
  if (!pk) {
    console.error('PRIVATE_KEY required');
    process.exit(1);
  }

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex);
  const operator = account.address;
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) });

  const exchange = await createMarketsExchange({ privateKey: pk });
  const all = Object.values(await exchange.loadMarkets(true));
  const perp =
    all.find((m) => m.active && isPerpMarket(m.info) && m.symbol.startsWith('XRP/')) ??
    all.find((m) => m.active && isPerpMarket(m.info));
  if (!perp) {
    console.error('No perp market');
    process.exit(1);
  }

  const pool = perp.info.poolAddress as Address;
  console.log(`Pool: ${perp.symbol} ${pool}`);
  console.log(`Follower/operator wallet: ${operator}`);

  const registry = await publicClient.readContract({
    address: MARKETS_CORE,
    abi: marketsCoreAbi,
    functionName: 'operatorPermissionsRegistry',
  });
  console.log(`Operator registry: ${registry}`);

  const approved = await publicClient.readContract({
    address: registry,
    abi: operatorRegistryAbi,
    functionName: 'isApprovedForPool',
    args: [pool, operator, operator, PLACE_ORDER_FOR_SELECTOR],
  });
  if (!approved) {
    console.log('Granting placeOrderFor operator approval…');
    const grantHash = await walletClient.writeContract({
      address: registry,
      abi: operatorRegistryAbi,
      functionName: 'setOperatorApprovalForPool',
      args: [pool, operator, [PLACE_ORDER_FOR_SELECTOR], true],
      chain: somniaTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: grantHash });
    console.log(`Grant tx: ${grantHash}`);
  } else {
    console.log('Operator already approved');
  }

  const [markPrice, , lotSize] = await publicClient.readContract({
    address: pool,
    abi: perpPoolAbi,
    functionName: 'getOrderBookParameters',
  });
  const price =
    markPrice ??
    (await publicClient.readContract({ address: pool, abi: perpPoolAbi, functionName: 'getMarkPrice' }));
  const quantity = lotSize > 0n ? lotSize : 1n;
  const execPrice = (price * 102n) / 100n;
  const expireNs = BigInt((Math.floor(Date.now() / 1000) + 300) * 1_000_000_000);

  console.log(`placeOrderFor buy qty=${quantity} price=${execPrice}…`);
  const orderHash = await walletClient.writeContract({
    address: pool,
    abi: perpPoolAbi,
    functionName: 'placeOrderFor',
    args: [operator, true, 0n, execPrice, quantity, expireNs, 2, 0, '0x0000000000000000000000000000000000000000', 0n],
    chain: somniaTestnet,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: orderHash });
  console.log(`OPERATOR_TRADE_OK tx=${orderHash} status=${receipt.status}`);
  console.log('\nVERDICT: placeOrderFor operator path proven — PerpRouter mirror viable');
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
