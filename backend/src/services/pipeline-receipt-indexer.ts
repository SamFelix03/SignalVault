import { type Address, type Log, keccak256, toBytes } from 'viem';
import { publicClient } from '../config/chains';
import { vaultIndexer } from './vault-indexer';
import { receiptStore, type Receipt, type ReceiptStage } from './receipt-store';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { logger } from '../utils/logger';

const CTX = 'PipelineReceiptIndexer';

const PIPELINE_COMPLETED = keccak256(toBytes('PipelineCompleted(uint256,int8,uint16)'));

class PipelineReceiptIndexer {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastBlock = 0n;

  async start(): Promise<void> {
    this.lastBlock = await publicClient.getBlockNumber();
    this.pollInterval = setInterval(() => this.poll().catch(() => {}), 12_000);
    logger.info(CTX, 'Pipeline receipt indexer started');
  }

  stop(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async poll(): Promise<void> {
    const latest = await publicClient.getBlockNumber();
    if (latest <= this.lastBlock) return;

    const vaults = vaultIndexer.getAllVaults();
    for (const vault of vaults) {
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
    if (!topic0) return;

    if (topic0 === PIPELINE_COMPLETED) {
      await this.buildReceipt(vaultAddress, orchestrator, log);
    }
  }

  private async buildReceipt(vaultAddress: Address, orchestrator: Address, log: Log): Promise<void> {
    const runId = log.topics[1] ? BigInt(log.topics[1]) : 0n;
    if (runId === 0n) return;

    const [price, funding, fearGreed, news] = await publicClient.readContract({
      address: orchestrator,
      abi: AgentOrchestratorABI,
      functionName: 'getPipelineData',
      args: [runId],
    }) as [bigint, bigint, bigint, string];

    const stages: ReceiptStage[] = [
      {
        stage: 'json_api_price',
        type: 'oracle',
        url: 'protofire BTC/USD oracle',
        result: { price: price.toString() },
        validators: [],
        consensus: true,
      },
      {
        stage: 'json_api_funding',
        type: 'json_api',
        url: 'coingecko 24h change',
        result: { funding: funding.toString() },
        validators: [],
        consensus: true,
      },
      {
        stage: 'fear_greed',
        type: 'llm_parse',
        url: 'alternative.me',
        result: { fearGreedIndex: fearGreed.toString() },
        validators: [],
        consensus: true,
      },
      {
        stage: 'news',
        type: 'llm_parse',
        url: 'coindesk.com',
        result: { summary: news },
        validators: [],
        consensus: true,
      },
    ];

    const hash = keccak256(
      toBytes(`${vaultAddress}-${runId}-${log.blockNumber}-${price}-${funding}-${news}`),
    );

    if (receiptStore.get(hash)) return;

    const receipt: Receipt = {
      hash,
      epoch: Number(runId),
      blockNumber: Number(log.blockNumber),
      stages,
    };

    receiptStore.store(receipt);
    logger.info(CTX, `Indexed receipt ${hash} for vault ${vaultAddress} run ${runId}`);
  }
}

export const pipelineReceiptIndexer = new PipelineReceiptIndexer();
