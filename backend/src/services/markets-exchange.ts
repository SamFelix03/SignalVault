import { type Hex } from 'viem';
import { MARKETS_INDEXER_URL, WS_RPC_URL } from '../config/constants';

export type MarketsExchange = InstanceType<
  Awaited<ReturnType<typeof loadMarketsSdk>>['SomniaMarkets']
>;

async function loadMarketsSdk() {
  const [sdk, chains] = await Promise.all([
    import('@somnia-chain/markets-sdk'),
    import('@somnia-chain/markets-sdk/chains'),
  ]);
  return { ...sdk, somniaShannon: chains.somniaShannon };
}

function normalizePrivateKey(privateKey: string): Hex {
  return (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
}

/** Shared Somnia Markets exchange client (indexer + chain reads/writes). */
export async function createMarketsExchange(opts?: { privateKey?: string }): Promise<MarketsExchange> {
  const { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, somniaShannon } = await loadMarketsSdk();
  return new SomniaMarkets({
    indexerUrl: MARKETS_INDEXER_URL,
    chain: somniaShannon,
    wsRpcUrl: WS_RPC_URL,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    ...(opts?.privateKey ? { privateKey: normalizePrivateKey(opts.privateKey) } : {}),
  });
}
