import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { RPC_URL } from '../config/constants';
import { somniaTestnet } from '../config/chains';
import { ExternalSignalPublisherABI } from '../abis/ExternalSignalPublisher';
import { vaultIndexer, type VaultInfo } from './vault-indexer';
import { createMarketsExchange } from './markets-exchange';
import { logger } from '../utils/logger';

const CTX = 'WalletFillWatcher';
const POLL_MS = 15_000;

type FillRow = {
  id: string;
  market: string;
  pool?: string;
  fillPrice: string;
  taker: string | null;
  maker: string | null;
  takerSide: 'YES' | 'NO' | null;
  makerSide: 'YES' | 'NO' | null;
  takerIsBid?: boolean | null;
  timestamp: string;
};

function poolToMarketId(pool: string): Hex {
  const addr = pool.toLowerCase().replace('0x', '');
  return `0x${addr.padStart(64, '0')}` as Hex;
}

class WalletFillWatcher {
  private lastFillId = new Map<Address, string>();
  private bootstrapped = new Set<Address>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    logger.info(CTX, 'Starting wallet fill watcher');
    await this.poll().catch((err) => logger.error(CTX, 'Initial poll failed', err));
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => logger.error(CTX, 'Poll failed', err));
    }, POLL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info(CTX, 'Wallet fill watcher stopped');
  }

  private getRelayerKey(): Hex | null {
    const pk = process.env.RELAYER_PRIVATE_KEY;
    if (!pk) return null;
    return (pk.startsWith('0x') ? pk : `0x${pk}`) as Hex;
  }

  private async poll(): Promise<void> {
    const relayerKey = this.getRelayerKey();
    if (!relayerKey) {
      logger.warn(CTX, 'RELAYER_PRIVATE_KEY not set — wallet fill watcher idle');
      return;
    }

    const walletVaults = vaultIndexer
      .getAllVaults()
      .filter((v) => v.sourceType === 'WALLET' && v.sourceWallet);

    if (walletVaults.length === 0) return;

    for (const vault of walletVaults) {
      try {
        await this.pollVault(vault, relayerKey);
      } catch (err) {
        logger.error(CTX, `Failed to poll fills for vault ${vault.address}`, err);
      }
    }
  }

  private async pollVault(vault: VaultInfo, relayerKey: Hex): Promise<void> {
    const sourceWallet = vault.sourceWallet!;
    const exchange = await createMarketsExchange();
    const fills = await exchange.client.getUserFills(sourceWallet, { limit: 30 }) as FillRow[];
    if (fills.length === 0) return;

    const newestFirst = [...fills].sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id),
    );

    if (!this.bootstrapped.has(vault.address)) {
      this.lastFillId.set(vault.address, newestFirst[0].id);
      this.bootstrapped.add(vault.address);
      logger.info(CTX, `Bootstrapped fill cursor for vault ${vault.address}`, {
        lastFillId: newestFirst[0].id,
      });
      return;
    }

    const lastId = this.lastFillId.get(vault.address);
    const newFills: FillRow[] = [];
    for (const fill of newestFirst) {
      if (fill.id === lastId) break;
      newFills.push(fill);
    }

    if (newFills.length === 0) return;

    for (const fill of newFills.reverse()) {
      await this.publishFromFill(vault, fill, relayerKey);
      this.lastFillId.set(vault.address, fill.id);
    }
  }

  private fillDirection(fill: FillRow, sourceWallet: Address, instrumentType: VaultInfo['instrumentType']): number {
    const wallet = sourceWallet.toLowerCase();
    const isTaker = fill.taker?.toLowerCase() === wallet;
    const isMaker = fill.maker?.toLowerCase() === wallet;

    if (instrumentType === 'PERP') {
      if (isTaker && fill.takerIsBid != null) return fill.takerIsBid ? 1 : -1;
      if (isMaker && fill.takerIsBid != null) return fill.takerIsBid ? -1 : 1;
      return 0;
    }

    const side = isTaker ? fill.takerSide : isMaker ? fill.makerSide : fill.takerSide ?? fill.makerSide;
    if (side === 'YES') return 1;
    if (side === 'NO') return -1;
    return 0;
  }

  private async publishFromFill(
    vault: VaultInfo,
    fill: FillRow,
    relayerKey: Hex,
  ): Promise<void> {
    const direction = this.fillDirection(fill, vault.sourceWallet!, vault.instrumentType ?? 'BINARY');
    if (direction === 0) {
      logger.warn(CTX, `Skipping fill ${fill.id} — could not resolve direction`);
      return;
    }

    const marketId =
      vault.instrumentType === 'PERP' && fill.pool
        ? poolToMarketId(fill.pool)
        : (fill.market as Hex);
    const limitPrice = BigInt(fill.fillPrice);
    const sizeBps = 10_000;
    const reason = `Wallet fill ${fill.id.slice(0, 18)}…`;

    if (vault.instrumentType !== 'PERP') {
      const onchain = await this.getMarketStatus(marketId);
      if (onchain !== null && onchain !== 1) {
        logger.info(CTX, `Skipping fill ${fill.id} — market status ${onchain} (not Trading)`);
        return;
      }
    }

    const account = privateKeyToAccount(relayerKey);
    const chain = somniaTestnet;
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(RPC_URL),
    });

    const hash = await walletClient.writeContract({
      address: vault.orchestrator,
      abi: ExternalSignalPublisherABI,
      functionName: 'publish',
      args: [direction, sizeBps, marketId, limitPrice, reason],
      chain,
    });

    await publicClient.waitForTransactionReceipt({ hash });

    logger.info(CTX, `Published wallet signal for vault ${vault.address}`, {
      fillId: fill.id,
      direction,
      marketId,
      limitPrice: limitPrice.toString(),
      txHash: hash,
    });
  }

  private async getMarketStatus(marketId: Hex): Promise<number | null> {
    try {
      const exchange = await createMarketsExchange();
      const onchain = await exchange.client.getMarketOnchain(marketId);
      return Number(onchain.status);
    } catch (err) {
      logger.warn(CTX, `Could not read on-chain status for ${marketId}`, err);
      return null;
    }
  }
}

export const walletFillWatcher = new WalletFillWatcher();
