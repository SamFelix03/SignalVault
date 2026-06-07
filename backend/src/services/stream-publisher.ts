import { SDK as StreamsSDK, SchemaEncoder, zeroBytes32 } from '@somnia-chain/streams';
import { SDK as ReactivitySDK, type SubscriptionCallback } from '@somnia-chain/reactivity';
import { keccak256, toBytes, toHex, createPublicClient, webSocket, type Address, type Log } from 'viem';
import { publicClient, getWalletClient, config } from '../config/chains';
import { somniaTestnet } from '../config/chains';
import { SIGNAL_SCHEMA, PNL_SCHEMA, VAULT_META_SCHEMA } from '../config/schemas';
import { WS_RPC_URL } from '../config/constants';
import { vaultIndexer } from './vault-indexer';
import { logger } from '../utils/logger';
import { decodeSignalUpdated, decodeTradeSettled, decodeDrawdownUpdated } from '../utils/decoder';

const CTX = 'StreamPublisher';

const EVENT_SIGNATURES = {
  SignalUpdated: keccak256(toBytes('SignalUpdated(bytes32,int8,uint16,uint256,string,bytes32)')),
  TradeSettled: keccak256(toBytes('TradeSettled(uint256,int8,int256,uint256,uint256)')),
  DrawdownUpdated: keccak256(toBytes('DrawdownUpdated(address,uint256,uint256)')),
};

interface SchemaIds {
  signal: `0x${string}`;
  pnl: `0x${string}`;
  vaultMeta: `0x${string}`;
}

class StreamPublisher {
  private streamsSDK: InstanceType<typeof StreamsSDK> | null = null;
  private reactivitySDK: InstanceType<typeof ReactivitySDK> | null = null;
  private schemaIds: SchemaIds | null = null;
  private unsubscribe: (() => Promise<unknown>) | null = null;

  async start(): Promise<void> {
    logger.info(CTX, 'Starting stream publisher');

    try {
      const walletClient = getWalletClient();
      // Somnia SDK types are pinned to a specific viem release; cast avoids duplicate-viem type clashes in workspaces.
      const streamsClient = { public: publicClient, wallet: walletClient } as ConstructorParameters<typeof StreamsSDK>[0];
      this.streamsSDK = new StreamsSDK(streamsClient);

      const wsPublicClient = createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(WS_RPC_URL),
      });
      const reactivityClient = { public: wsPublicClient } as ConstructorParameters<typeof ReactivitySDK>[0];
      this.reactivitySDK = new ReactivitySDK(reactivityClient);

      await this.initSchemaIds();
      await this.subscribeToEvents();

      logger.info(CTX, 'Stream publisher started successfully');
    } catch (err) {
      logger.error(CTX, 'Failed to start stream publisher', err);
    }
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      await this.unsubscribe();
      this.unsubscribe = null;
    }
    logger.info(CTX, 'Stream publisher stopped');
  }

  private async initSchemaIds(): Promise<void> {
    if (!this.streamsSDK) return;

    try {
      const signalId = await this.streamsSDK.streams.computeSchemaId(SIGNAL_SCHEMA);
      const pnlId = await this.streamsSDK.streams.computeSchemaId(PNL_SCHEMA);
      const vaultMetaId = await this.streamsSDK.streams.computeSchemaId(VAULT_META_SCHEMA);

      this.schemaIds = {
        signal: signalId as `0x${string}`,
        pnl: pnlId as `0x${string}`,
        vaultMeta: vaultMetaId as `0x${string}`,
      };

      logger.info(CTX, 'Schema IDs computed', this.schemaIds);
    } catch (err) {
      logger.warn(CTX, 'Failed to compute schema IDs (streams may not be registered)', err);
    }
  }

  private async subscribeToEvents(): Promise<void> {
    if (!this.reactivitySDK) return;

    const contractSources: Address[] = [];
    const vaults = vaultIndexer.getAllVaults();
    for (const vault of vaults) {
      contractSources.push(vault.address);
    }

    if (contractSources.length === 0) {
      logger.warn(CTX, 'No vault contracts to watch, using wildcard subscription');
    }

    const sub = await this.reactivitySDK.subscribe({
      ethCalls: [],
      eventContractSources: contractSources.length > 0 ? contractSources : undefined,
      topicOverrides: [
        EVENT_SIGNATURES.SignalUpdated,
        EVENT_SIGNATURES.TradeSettled,
        EVENT_SIGNATURES.DrawdownUpdated,
      ],
      onData: (data: SubscriptionCallback) => {
        this.handleEvent(data).catch((err) =>
          logger.error(CTX, 'Error handling event', err)
        );
      },
      onError: (err: Error) => {
        logger.error(CTX, 'Subscription error', err);
        this.reconnect();
      },
    });

    if (sub instanceof Error) {
      logger.error(CTX, 'Failed to subscribe', sub);
      return;
    }

    this.unsubscribe = sub.unsubscribe;
    logger.info(CTX, `Subscribed with id ${sub.subscriptionId}, watching ${contractSources.length} contracts`);
  }

  private async handleEvent(data: SubscriptionCallback): Promise<void> {
    const topics = data.result?.topics;
    if (!topics?.[0]) return;

    const topic0 = topics[0];

    if (topic0 === EVENT_SIGNATURES.SignalUpdated) {
      await this.publishSignal(data);
    } else if (topic0 === EVENT_SIGNATURES.TradeSettled) {
      await this.publishPnL(data);
    } else if (topic0 === EVENT_SIGNATURES.DrawdownUpdated) {
      await this.publishVaultMeta(data);
    }
  }

  private toLog(data: SubscriptionCallback): Log {
    const result = data.result as any;
    return {
      address: (result.address ?? '0x0000000000000000000000000000000000000000') as Address,
      topics: result.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      data: result.data as `0x${string}`,
      blockHash: (result.blockHash ?? '0x0') as `0x${string}`,
      blockNumber: BigInt(result.blockNumber ?? 0),
      transactionHash: (result.transactionHash ?? '0x0') as `0x${string}`,
      transactionIndex: Number(result.transactionIndex ?? 0),
      logIndex: Number(result.logIndex ?? 0),
      removed: false,
    };
  }

  private async publishSignal(data: SubscriptionCallback): Promise<void> {
    if (!this.streamsSDK || !this.schemaIds) return;

    try {
      const log = this.toLog(data);
      const decoded = decodeSignalUpdated(log);
      const encoder = new SchemaEncoder(SIGNAL_SCHEMA);

      const now = BigInt(Math.floor(Date.now() / 1000));
      const payload = encoder.encodeData([
        { name: 'timestamp', value: now, type: 'uint64' },
        { name: 'vault', value: decoded.vault, type: 'address' },
        { name: 'direction', value: BigInt(decoded.direction), type: 'int8' },
        { name: 'sizeBps', value: BigInt(decoded.sizeBps), type: 'uint16' },
        { name: 'stopPrice', value: decoded.stopPrice, type: 'uint256' },
        { name: 'reasoningHash', value: decoded.reasoningHash, type: 'bytes32' },
        { name: 'reasoning', value: decoded.reasoningSummary, type: 'string' },
      ]);

      const dataId = toHex(`signal-${Date.now()}`, { size: 32 });
      const tx = await this.streamsSDK.streams.set([
        { id: dataId, schemaId: this.schemaIds.signal, data: payload },
      ]);

      logger.info(CTX, `Published signal for vault ${decoded.vault}`, { tx, direction: decoded.direction, sizeBps: decoded.sizeBps });

      vaultIndexer.addSignalRecord(decoded.vault, {
        direction: decoded.direction,
        sizeBps: decoded.sizeBps,
        stopPrice: decoded.stopPrice.toString(),
        reasoningHash: decoded.reasoningHash,
        reasoningSummary: decoded.reasoningSummary,
        epoch: now.toString(),
      });
    } catch (err) {
      logger.error(CTX, 'Failed to publish signal', err);
    }
  }

  private async publishPnL(data: SubscriptionCallback): Promise<void> {
    if (!this.streamsSDK || !this.schemaIds) return;

    try {
      const log = this.toLog(data);
      const decoded = decodeTradeSettled(log);
      const encoder = new SchemaEncoder(PNL_SCHEMA);

      const now = BigInt(Math.floor(Date.now() / 1000));
      const payload = encoder.encodeData([
        { name: 'timestamp', value: now, type: 'uint64' },
        { name: 'vault', value: decoded.vault, type: 'address' },
        { name: 'follower', value: decoded.follower, type: 'address' },
        { name: 'direction', value: BigInt(decoded.direction), type: 'int8' },
        { name: 'entryPrice', value: decoded.entryPrice, type: 'uint256' },
        { name: 'exitPrice', value: decoded.exitPrice, type: 'uint256' },
        { name: 'pnlBps', value: decoded.pnlBps, type: 'int256' },
        { name: 'signalHash', value: decoded.signalHash, type: 'bytes32' },
      ]);

      const dataId = toHex(`pnl-${Date.now()}`, { size: 32 });
      const tx = await this.streamsSDK.streams.set([
        { id: dataId, schemaId: this.schemaIds.pnl, data: payload },
      ]);

      logger.info(CTX, `Published PnL for vault ${decoded.vault}`, { tx, pnlBps: decoded.pnlBps.toString() });

      vaultIndexer.addTradeRecord(decoded.vault, {
        vault: decoded.vault,
        follower: decoded.follower,
        direction: decoded.direction,
        entryPrice: decoded.entryPrice.toString(),
        exitPrice: decoded.exitPrice.toString(),
        pnlBps: decoded.pnlBps.toString(),
        signalHash: decoded.signalHash,
      });
    } catch (err) {
      logger.error(CTX, 'Failed to publish PnL', err);
    }
  }

  private async publishVaultMeta(data: SubscriptionCallback): Promise<void> {
    if (!this.streamsSDK || !this.schemaIds) return;

    try {
      const log = this.toLog(data);
      const decoded = decodeDrawdownUpdated(log);
      const encoder = new SchemaEncoder(VAULT_META_SCHEMA);

      const vault = vaultIndexer.getVault(decoded.vault);
      const now = BigInt(Math.floor(Date.now() / 1000));

      const payload = encoder.encodeData([
        { name: 'timestamp', value: now, type: 'uint64' },
        { name: 'vault', value: decoded.vault, type: 'address' },
        { name: 'strategist', value: (vault?.strategist || decoded.vault) as Address, type: 'address' },
        { name: 'name', value: vault?.strategyPrompt?.slice(0, 50) || 'Unknown', type: 'string' },
        { name: 'performanceFeeBps', value: BigInt(vault?.performanceFeeBps || 0), type: 'uint16' },
        { name: 'followerCount', value: BigInt(vault?.followerCount || 0), type: 'uint256' },
        { name: 'sharpe30dBps', value: BigInt(0), type: 'int256' },
        { name: 'maxDrawdownBps', value: decoded.maxDrawdownBps, type: 'uint256' },
      ]);

      const dataId = toHex(`meta-${Date.now()}`, { size: 32 });
      const tx = await this.streamsSDK.streams.set([
        { id: dataId, schemaId: this.schemaIds.vaultMeta, data: payload },
      ]);

      logger.info(CTX, `Published vault meta for ${decoded.vault}`, { tx, maxDrawdownBps: decoded.maxDrawdownBps.toString() });
    } catch (err) {
      logger.error(CTX, 'Failed to publish vault meta', err);
    }
  }

  private reconnect(): void {
    logger.info(CTX, 'Attempting reconnection in 5s...');
    setTimeout(() => {
      this.subscribeToEvents().catch((err) =>
        logger.error(CTX, 'Reconnection failed', err)
      );
    }, 5000);
  }
}

export const streamPublisher = new StreamPublisher();
