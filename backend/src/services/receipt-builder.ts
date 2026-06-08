import {
  type Address,
  encodePacked,
  keccak256,
  parseAbiItem,
  toBytes,
  type Hex,
} from 'viem';
import { publicClient } from '../config/chains';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { StrategyVaultABI } from '../abis/StrategyVault';
import { vaultIndexer } from './vault-indexer';
import { receiptStore, type Receipt, type ReceiptStage } from './receipt-store';
import { logger } from '../utils/logger';

const CTX = 'ReceiptBuilder';

export function ruleBasedReasoningHash(
  price: bigint,
  fearGreed: bigint,
  news: string,
): Hex {
  return keccak256(encodePacked(['uint256', 'uint256', 'string'], [price, fearGreed, news]));
}

export function llmReasoningHash(
  price: bigint,
  funding: bigint,
  fearGreed: bigint,
  response: string,
): Hex {
  return keccak256(
    encodePacked(['uint256', 'uint256', 'uint256', 'string'], [price, funding, fearGreed, response]),
  );
}

function buildStages(
  price: bigint,
  funding: bigint,
  fearGreed: bigint,
  news: string,
): ReceiptStage[] {
  return [
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
}

export async function findRunIdForReasoningHash(
  orchestrator: Address,
  reasoningHash: string,
): Promise<bigint | null> {
  const normalized = reasoningHash.toLowerCase();
  const currentRunId = await publicClient.readContract({
    address: orchestrator,
    abi: AgentOrchestratorABI,
    functionName: 'currentRunId',
  }) as bigint;

  for (let runId = 1n; runId <= currentRunId; runId++) {
    const [price, funding, fearGreed, news] = await publicClient.readContract({
      address: orchestrator,
      abi: AgentOrchestratorABI,
      functionName: 'getPipelineData',
      args: [runId],
    }) as [bigint, bigint, bigint, string];

    const ruleHash = ruleBasedReasoningHash(price, fearGreed, news);
    if (ruleHash.toLowerCase() === normalized) return runId;

    const inferHash = llmReasoningHash(price, funding, fearGreed, news);
    if (inferHash.toLowerCase() === normalized) return runId;
  }

  return null;
}

const MAX_LOG_RANGE = 900n;

async function getLogsInChunks(
  orchestrator: Address,
  runId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const event = parseAbiItem(
    'event PipelineCompleted(uint256 indexed runId, int8 direction, uint16 sizeBps)',
  );
  const logs = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end = start + MAX_LOG_RANGE > toBlock ? toBlock : start + MAX_LOG_RANGE;
    const batch = await publicClient.getLogs({
      address: orchestrator,
      event,
      args: { runId },
      fromBlock: start,
      toBlock: end,
    });
    logs.push(...batch);
    start = end + 1n;
  }

  return logs;
}

async function findPipelineCompletedLog(
  orchestrator: Address,
  runId: bigint,
  nearBlock?: number,
): Promise<{ blockNumber: bigint; txHash: Hex } | null> {
  const latest = await publicClient.getBlockNumber();

  let fromBlock: bigint;
  let toBlock: bigint;
  if (nearBlock != null && nearBlock > 0) {
    fromBlock = BigInt(Math.max(nearBlock - 25, 0));
    toBlock = BigInt(nearBlock + 25) > latest ? latest : BigInt(nearBlock + 25);
  } else {
    fromBlock = latest > MAX_LOG_RANGE ? latest - MAX_LOG_RANGE : 0n;
    toBlock = latest;
  }

  const logs = await getLogsInChunks(orchestrator, runId, fromBlock, toBlock);
  const log = logs.at(-1);
  if (!log) return null;

  return {
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
  };
}

async function signalEpochForHash(vaultAddress: Address, reasoningHash: string): Promise<number | null> {
  const length = await publicClient.readContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'signalHistoryLength',
  }) as bigint;

  const total = Number(length);
  if (total === 0) return null;

  const history = await publicClient.readContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'getSignalHistory',
    args: [0n, BigInt(total)],
  }) as unknown as Array<{ reasoningHash: string; epoch: bigint }>;

  const match = history.find((s) => s.reasoningHash.toLowerCase() === reasoningHash.toLowerCase());
  return match ? Number(match.epoch) : null;
}

export async function buildReceiptFromRun(
  vaultAddress: Address,
  orchestrator: Address,
  runId: bigint,
  reasoningHash: string,
): Promise<Receipt> {
  const [price, funding, fearGreed, news] = await publicClient.readContract({
    address: orchestrator,
    abi: AgentOrchestratorABI,
    functionName: 'getPipelineData',
    args: [runId],
  }) as [bigint, bigint, bigint, string];

  const signalEpoch = await signalEpochForHash(vaultAddress, reasoningHash);
  const completion = await findPipelineCompletedLog(
    orchestrator,
    runId,
    signalEpoch ?? undefined,
  );

  return {
    hash: reasoningHash,
    vaultAddress,
    orchestrator,
    runId: Number(runId),
    epoch: signalEpoch ?? Number(runId),
    blockNumber: completion ? Number(completion.blockNumber) : (signalEpoch ?? 0),
    txHash: completion?.txHash,
    stages: buildStages(price, funding, fearGreed, news),
  };
}

async function findRunIdBySignalEpoch(
  orchestrator: Address,
  epoch: number,
): Promise<bigint | null> {
  const latest = await publicClient.getBlockNumber();
  const fromBlock = BigInt(Math.max(epoch - 5, 0));
  const toBlock = BigInt(epoch + 5) > latest ? latest : BigInt(epoch + 5);

  const logs = await publicClient.getLogs({
    address: orchestrator,
    event: parseAbiItem('event PipelineCompleted(uint256 indexed runId, int8 direction, uint16 sizeBps)'),
    fromBlock,
    toBlock,
  });

  const log = logs.at(-1);
  return log?.topics[1] ? BigInt(log.topics[1]) : null;
}

export async function getOrBuildReceipt(
  reasoningHash: string,
  vaultAddress?: Address,
): Promise<Receipt | null> {
  const cached = receiptStore.get(reasoningHash);
  if (cached) return cached;

  const candidates = vaultAddress
    ? [vaultIndexer.getVault(vaultAddress)].filter((v) => v != null)
    : vaultIndexer.getAllVaults();

  for (const vault of candidates) {
    let runId = await findRunIdForReasoningHash(vault.orchestrator, reasoningHash);

    if (runId === null) {
      const epoch = await signalEpochForHash(vault.address, reasoningHash);
      if (epoch !== null) {
        runId = await findRunIdBySignalEpoch(vault.orchestrator, epoch);
      }
    }

    if (runId === null) continue;

    const receipt = await buildReceiptFromRun(
      vault.address,
      vault.orchestrator,
      runId,
      reasoningHash,
    );

    receiptStore.store(receipt);
    logger.info(CTX, `Built receipt ${reasoningHash} for vault ${vault.address} run ${runId}`);
    return receipt;
  }

  return null;
}

export async function backfillReceiptsForVault(vaultAddress: Address): Promise<number> {
  const vault = vaultIndexer.getVault(vaultAddress);
  if (!vault) return 0;

  const length = await publicClient.readContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'signalHistoryLength',
  }) as bigint;

  const total = Number(length);
  if (total === 0) return 0;

  const history = await publicClient.readContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'getSignalHistory',
    args: [0n, BigInt(total)],
  }) as unknown as Array<{ reasoningHash: string }>;

  let stored = 0;
  for (const signal of history) {
    if (!signal.reasoningHash || signal.reasoningHash === `0x${'0'.repeat(64)}`) continue;
    if (receiptStore.get(signal.reasoningHash)) continue;

    const receipt = await getOrBuildReceipt(signal.reasoningHash, vaultAddress);
    if (receipt) stored++;
  }

  return stored;
}
