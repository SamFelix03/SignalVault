import { type Address, type Log, getAddress, keccak256, toBytes } from 'viem';
import { publicClient, config } from '../config/chains';
import { VaultFactoryABI } from '../abis/VaultFactory';
import { StrategyVaultABI } from '../abis/StrategyVault';
import { logger } from '../utils/logger';
import { sanitizePipelineText } from '../utils/sanitize-pipeline-text';
import { eventBus } from './event-bus';
import { computeOnChainSignalHash, mirrorWorker } from './mirror-worker';
import { followerVaultIndex } from './follower-vault-index';

const CTX = 'VaultIndexer';

export interface VaultInfo {
  address: Address;
  vaultId: number;
  strategist: Address;
  orchestrator: Address;
  mirrorReactor: Address;
  stopReactor: Address;
  performanceLedger: Address;
  feeDistributor: Address;
  drawdownGuard: Address;
  epochCron: Address;
  deployedAt: string;
  strategyPrompt: string;
  performanceFeeBps: number;
  followerCount: number;
  currentSignal?: {
    direction: number;
    sizeBps: number;
    stopPrice: string;
    epoch: string;
    reasoningHash: string;
    reasoningSummary: string;
  };
}

export interface SignalRecord {
  direction: number;
  sizeBps: number;
  stopPrice: string;
  reasoningHash: string;
  reasoningSummary: string;
  epoch: string;
}

export interface TradeRecord {
  vault: string;
  follower: string;
  direction: number;
  entryPrice: string;
  exitPrice: string;
  pnlBps: string;
  signalHash: string;
  timestamp?: number;
  size?: string;
}

class VaultIndexer {
  private vaults: Map<Address, VaultInfo> = new Map();
  private signals: Map<Address, SignalRecord[]> = new Map();
  private trades: Map<Address, TradeRecord[]> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private indexedDeploymentCount = 0;

  async start(): Promise<void> {
    logger.info(CTX, 'Starting vault indexer');

    if (!config.vaultFactoryAddress) {
      logger.warn(CTX, 'VAULT_FACTORY_ADDRESS not set, indexer will wait for configuration');
      return;
    }

    await this.loadExistingVaults();
    this.startPolling();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info(CTX, 'Vault indexer stopped');
  }

  private async loadExistingVaults(): Promise<void> {
    if (!config.vaultFactoryAddress) return;

    try {
      const count = await publicClient.readContract({
        address: config.vaultFactoryAddress,
        abi: VaultFactoryABI,
        functionName: 'getDeploymentCount',
      }) as bigint;

      for (let i = 0; i < Number(count); i++) {
        await this.indexVaultById(i);
      }

      this.indexedDeploymentCount = Number(count);
      logger.info(CTX, `Indexed ${count} existing vaults`);
    } catch (err) {
      logger.error(CTX, 'Failed to load existing vaults', err);
    }
  }

  private async indexVaultById(vaultId: number): Promise<void> {
    if (!config.vaultFactoryAddress) return;

    try {
      const dep = await publicClient.readContract({
        address: config.vaultFactoryAddress,
        abi: VaultFactoryABI,
        functionName: 'getDeployment',
        args: [BigInt(vaultId)],
      }) as {
        vault: Address; orchestrator: Address; mirrorReactor: Address;
        stopReactor: Address; drawdownGuard: Address; epochCron: Address;
        performanceLedger: Address; feeDistributor: Address;
        strategist: Address; deployedAt: bigint;
      };

      const vaultAddr = dep.vault;

      const [strategist, strategyPrompt, performanceFeeBps] = await Promise.all([
        publicClient.readContract({ address: vaultAddr, abi: StrategyVaultABI, functionName: 'strategist' }),
        publicClient.readContract({ address: vaultAddr, abi: StrategyVaultABI, functionName: 'strategyPrompt' }),
        publicClient.readContract({ address: vaultAddr, abi: StrategyVaultABI, functionName: 'performanceFeeBps' }),
      ]);

      let followerCount = 0;
      try {
        const followers = await publicClient.readContract({ address: vaultAddr, abi: StrategyVaultABI, functionName: 'getFollowers' }) as Address[];
        followerCount = followers.length;
      } catch { /* no followers yet */ }

      const vault: VaultInfo = {
        address: vaultAddr,
        vaultId,
        strategist: strategist as Address,
        orchestrator: dep.orchestrator,
        mirrorReactor: dep.mirrorReactor,
        stopReactor: dep.stopReactor,
        performanceLedger: dep.performanceLedger,
        feeDistributor: dep.feeDistributor,
        drawdownGuard: dep.drawdownGuard,
        epochCron: dep.epochCron,
        deployedAt: dep.deployedAt.toString(),
        strategyPrompt: strategyPrompt as string,
        performanceFeeBps: Number(performanceFeeBps),
        followerCount,
      };

      try {
        const signal = await publicClient.readContract({
          address: vaultAddr,
          abi: StrategyVaultABI,
          functionName: 'getCurrentSignal',
        }) as { direction: number; sizeBps: number; stopPrice: bigint; epoch: bigint; reasoningHash: string; reasoningSummary: string };

        vault.currentSignal = {
          direction: signal.direction,
          sizeBps: signal.sizeBps,
          stopPrice: signal.stopPrice.toString(),
          epoch: signal.epoch.toString(),
          reasoningHash: signal.reasoningHash,
          reasoningSummary: sanitizePipelineText(signal.reasoningSummary),
        };
      } catch { /* no signal yet */ }

      this.vaults.set(vaultAddr, vault);
      if (!this.signals.has(vaultAddr)) this.signals.set(vaultAddr, []);
      if (!this.trades.has(vaultAddr)) this.trades.set(vaultAddr, []);

      followerVaultIndex.syncVault(vaultAddr).catch((err) => {
        logger.warn(CTX, `Follower index sync failed for ${vaultAddr}`, err);
      });

      logger.info(CTX, `Indexed vault #${vaultId}: ${vaultAddr}`);
    } catch (err) {
      logger.error(CTX, `Failed to index vault #${vaultId}`, err);
    }
  }

  private async syncNewDeployments(): Promise<void> {
    if (!config.vaultFactoryAddress) return;

    try {
      const count = await publicClient.readContract({
        address: config.vaultFactoryAddress,
        abi: VaultFactoryABI,
        functionName: 'getDeploymentCount',
      }) as bigint;

      const total = Number(count);
      for (let i = this.indexedDeploymentCount; i < total; i++) {
        await this.indexVaultById(i);
      }
      if (total > this.indexedDeploymentCount) {
        logger.info(CTX, `Discovered ${total - this.indexedDeploymentCount} new vault(s)`);
        this.indexedDeploymentCount = total;
      }
    } catch (err) {
      logger.error(CTX, 'Failed to sync new deployments', err);
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      await this.syncNewDeployments();

      for (const [address, vault] of this.vaults) {
        try {
          const followers = await publicClient.readContract({
            address,
            abi: StrategyVaultABI,
            functionName: 'getFollowers',
          }) as Address[];
          const prevFollowerCount = vault.followerCount;
          vault.followerCount = followers.length;
          if (followers.length !== prevFollowerCount) {
            followerVaultIndex.syncVault(address).catch(() => {});
          }

          const signal = await publicClient.readContract({
            address,
            abi: StrategyVaultABI,
            functionName: 'getCurrentSignal',
          }) as { direction: number; sizeBps: number; stopPrice: bigint; epoch: bigint; reasoningHash: string; reasoningSummary: string };

          const prev = vault.currentSignal;
          const next = {
            direction: signal.direction,
            sizeBps: signal.sizeBps,
            stopPrice: signal.stopPrice.toString(),
            epoch: signal.epoch.toString(),
            reasoningHash: signal.reasoningHash,
            reasoningSummary: sanitizePipelineText(signal.reasoningSummary),
          };
          vault.currentSignal = next;

          if (!prev || prev.epoch !== next.epoch || prev.reasoningHash !== next.reasoningHash) {
            eventBus.emitVaultUpdate(address, { vault: this.vaults.get(address) });
            const reasoningHash = next.reasoningHash as `0x${string}`;
            const signalHash = computeOnChainSignalHash(
              next.direction,
              next.sizeBps,
              BigInt(next.stopPrice),
              BigInt(next.epoch),
            );
            mirrorWorker.onSignalUpdated({
              vault: address,
              signalHash,
              direction: next.direction,
              sizeBps: next.sizeBps,
              stopPrice: BigInt(next.stopPrice),
              reasoningHash,
              reasoningSummary: next.reasoningSummary,
              timestamp: Number(next.epoch) || Math.floor(Date.now() / 1000),
            }).catch((err) => logger.error(CTX, 'Mirror worker poll hook failed', err));
          }
        } catch { /* skip failed polls */ }
      }
    }, 10_000);
  }

  addSignalRecord(vaultAddress: Address, record: SignalRecord): void {
    const records = this.signals.get(vaultAddress) || [];
    records.push(record);
    this.signals.set(vaultAddress, records);
  }

  addTradeRecord(vaultAddress: Address, record: TradeRecord): void {
    const records = this.trades.get(vaultAddress) || [];
    records.push(record);
    this.trades.set(vaultAddress, records);
  }

  getAllVaults(): VaultInfo[] {
    return Array.from(this.vaults.values());
  }

  getVault(address: Address): VaultInfo | undefined {
    try {
      return this.vaults.get(getAddress(address));
    } catch {
      const key = address.toLowerCase();
      return Array.from(this.vaults.values()).find((v) => v.address.toLowerCase() === key);
    }
  }

  getVaultByOrchestrator(orchestratorAddress: Address): VaultInfo | undefined {
    for (const vault of this.vaults.values()) {
      if (vault.orchestrator.toLowerCase() === orchestratorAddress.toLowerCase()) {
        return vault;
      }
    }
    return undefined;
  }

  getVaultSignals(address: Address): SignalRecord[] {
    return this.signals.get(address) || [];
  }

  getVaultTrades(address: Address): TradeRecord[] {
    return this.trades.get(address) || [];
  }

  /** Immediately index a vault by address (e.g. right after deploy). */
  async forceIndexVault(vaultAddress: Address): Promise<VaultInfo | undefined> {
    if (!config.vaultFactoryAddress) return undefined;

    const addr = getAddress(vaultAddress);
    const existing = this.vaults.get(addr);
    if (existing) return existing;

    try {
      const vaultId = await publicClient.readContract({
        address: config.vaultFactoryAddress,
        abi: VaultFactoryABI,
        functionName: 'vaultIndex',
        args: [addr],
      }) as bigint;

      await this.indexVaultById(Number(vaultId));
      this.indexedDeploymentCount = Math.max(
        this.indexedDeploymentCount,
        Number(vaultId) + 1,
      );
      return this.vaults.get(addr);
    } catch (err) {
      logger.error(CTX, `forceIndexVault failed for ${addr}`, err);
      return undefined;
    }
  }
}

export const vaultIndexer = new VaultIndexer();
