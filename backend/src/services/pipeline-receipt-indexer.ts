import { type Address, type Log } from 'viem';
import { publicClient } from '../config/chains';
import { vaultIndexer, isCustomAgentVault } from './vault-indexer';
import {
  backfillReceiptsForVault,
  buildReceiptFromRun,
  ruleBasedReasoningHash,
} from './receipt-builder';
import { receiptStore } from './receipt-store';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { logger } from '../utils/logger';
import { keccak256, toBytes } from 'viem';

const CTX = 'PipelineReceiptIndexer';

const PIPELINE_COMPLETED = keccak256(toBytes('PipelineCompleted(uint256,int8,uint16)'));

class PipelineReceiptIndexer {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastBlock = 0n;

  async start(): Promise<void> {
    await this.backfillAll();
    this.lastBlock = await publicClient.getBlockNumber();
    this.pollInterval = setInterval(() => this.poll().catch(() => {}), 12_000);
    logger.info(CTX, 'Pipeline receipt indexer started');
  }

  stop(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async backfillAll(): Promise<void> {
    const vaults = vaultIndexer.getAllVaults();
    for (const vault of vaults) {
      try {
        const count = await backfillReceiptsForVault(vault.address);
        if (count > 0) {
          logger.info(CTX, `Backfilled ${count} receipt(s) for vault ${vault.address}`);
        }
      } catch (err) {
        logger.warn(CTX, `Receipt backfill failed for ${vault.address}`, err);
      }
    }
  }

  private async poll(): Promise<void> {
    const latest = await publicClient.getBlockNumber();
    if (latest <= this.lastBlock) return;

    const vaults = vaultIndexer.getAllVaults();
    for (const vault of vaults) {
      if (isCustomAgentVault(vault)) continue;
      const logs = await publicClient.getLogs({
        address: vault.orchestrator,
        fromBlock: this.lastBlock + 1n,
        toBlock: latest,
      });

      for (const log of logs) {
        await this.handleLog(vault.address, vault.orchestrator, log);
      }
    }

    this.lastBlock = latest;
  }

  private async handleLog(vaultAddress: Address, orchestrator: Address, log: Log): Promise<void> {
    const topic0 = log.topics[0];
    if (!topic0 || topic0 !== PIPELINE_COMPLETED) return;

    const runId = log.topics[1] ? BigInt(log.topics[1]) : 0n;
    if (runId === 0n) return;

    const [price, , fearGreed, news] = await publicClient.readContract({
      address: orchestrator,
      abi: AgentOrchestratorABI,
      functionName: 'getPipelineData',
      args: [runId],
    }) as [bigint, bigint, bigint, string];

    const reasoningHash = ruleBasedReasoningHash(price, fearGreed, news);
    if (receiptStore.get(reasoningHash)) return;

    const receipt = await buildReceiptFromRun(vaultAddress, orchestrator, runId, reasoningHash);
    receipt.txHash = log.transactionHash ?? undefined;
    receipt.blockNumber = Number(log.blockNumber);
    receiptStore.store(receipt);
    logger.info(CTX, `Indexed receipt ${reasoningHash} for vault ${vaultAddress} run ${runId}`);
  }
}

export const pipelineReceiptIndexer = new PipelineReceiptIndexer();
