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
import { fetchPipelineFallbackData, type PipelineFallbackData } from './agent-fallback';
import { logger } from '../utils/logger';

const CTX = 'ReceiptBuilder';

const PLACEHOLDER_NEWS = [
  'Macro context unavailable',
  'News unavailable',
  'Agents timed out',
  'rule-based completion',
];

function isPlaceholderPipelineData(fearGreed: bigint, news: string): boolean {
  return PLACEHOLDER_NEWS.some((p) => news.includes(p));
}

function buildStages(
  price: bigint,
  funding: bigint,
  fearGreed: bigint,
  news: string,
  fallback?: PipelineFallbackData,
): ReceiptStage[] {
  const fngUrl = fallback?.sources.fearGreed ?? 'https://api.alternative.me/fng/';
  const fundingUrl = fallback?.sources.funding ?? 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin';
  const newsUrl = fallback?.sources.news ?? 'https://www.coindesk.com/arc/outboundfeeds/rss/';

  return [
    {
      stage: 'json_api_price',
      type: 'oracle',
      url: 'protofire BTC/USD oracle',
      result: { price: price.toString() },
      validators: [],
      consensus: true,
      fallbackSource: 'somnia',
    },
    {
      stage: 'json_api_funding',
      type: 'json_api',
      url: fundingUrl,
      result: {
        funding: funding.toString(),
        changePct: fallback?.fundingChangePct,
      },
      validators: [],
      consensus: true,
      fallbackSource: fallback ? 'http' : 'somnia',
    },
    {
      stage: 'fear_greed',
      type: 'llm_parse',
      url: fngUrl,
      result: {
        fearGreedIndex: fearGreed.toString(),
        classification: fallback?.fearGreedClassification,
      },
      validators: [],
      consensus: true,
      fallbackSource: fallback ? 'http' : 'somnia',
      confidence: fallback?.parseConfidence ?? 90,
    },
    {
      stage: 'news',
      type: 'llm_parse',
      url: newsUrl,
      result: {
        summary: news,
        headline: fallback?.newsHeadline,
        source: fallback?.newsSource,
      },
      validators: [],
      consensus: true,
      fallbackSource: fallback ? 'http' : 'somnia',
      confidence: fallback?.parseConfidence ?? 85,
    },
  ];
}

async function resolvePipelineInputs(
  price: bigint,
  funding: bigint,
  fearGreed: bigint,
  news: string,
): Promise<{
  funding: bigint;
  fearGreed: bigint;
  news: string;
  fallback?: PipelineFallbackData;
}> {
  if (!isPlaceholderPipelineData(fearGreed, news)) {
    return { funding, fearGreed, news };
  }

  try {
    const fallback = await fetchPipelineFallbackData();
    return {
      funding: funding > 0n ? funding : fallback.fetchedFunding,
      fearGreed: BigInt(fallback.fearGreedIndex),
      news: fallback.newsSummary,
      fallback,
    };
  } catch (err) {
    logger.warn(CTX, 'HTTP fallback enrichment failed', err);
    return { funding, fearGreed, news };
  }
}

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

const RULE_BASED_NEWS_MARKERS = ['Macro context unavailable', 'News unavailable'];

function isRuleBasedNews(news: string): boolean {
  return RULE_BASED_NEWS_MARKERS.some((m) => news.includes(m));
}

async function signalForHash(
  vaultAddress: Address,
  reasoningHash: string,
): Promise<{
  epoch: number;
  reasoningSummary: string;
  direction: number;
  sizeBps: number;
  stopPrice: string;
} | null> {
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
  }) as unknown as Array<{
    reasoningHash: string;
    epoch: bigint;
    reasoningSummary: string;
    direction: number;
    sizeBps: number;
    stopPrice: bigint;
  }>;

  const match = history.find((s) => s.reasoningHash.toLowerCase() === reasoningHash.toLowerCase());
  if (!match) return null;

  return {
    epoch: Number(match.epoch),
    reasoningSummary: match.reasoningSummary,
    direction: Number(match.direction),
    sizeBps: Number(match.sizeBps),
    stopPrice: match.stopPrice.toString(),
  };
}

async function signalEpochForHash(vaultAddress: Address, reasoningHash: string): Promise<number | null> {
  const signal = await signalForHash(vaultAddress, reasoningHash);
  return signal?.epoch ?? null;
}

export async function buildReceiptFromRun(
  vaultAddress: Address,
  orchestrator: Address,
  runId: bigint,
  reasoningHash: string,
): Promise<Receipt> {
  const [price, fundingRaw, fearGreedRaw, newsRaw] = await publicClient.readContract({
    address: orchestrator,
    abi: AgentOrchestratorABI,
    functionName: 'getPipelineData',
    args: [runId],
  }) as [bigint, bigint, bigint, string];

  const resolved = await resolvePipelineInputs(price, fundingRaw, fearGreedRaw, newsRaw);

  const signal = await signalForHash(vaultAddress, reasoningHash);
  const completion = await findPipelineCompletedLog(
    orchestrator,
    runId,
    signal?.epoch ?? undefined,
  );

  const ruleBased = isRuleBasedNews(newsRaw)
    || (signal?.reasoningSummary?.startsWith('Rule-based signal:') ?? false)
    || resolved.fallback != null;

  return {
    hash: reasoningHash,
    vaultAddress,
    orchestrator,
    runId: Number(runId),
    epoch: signal?.epoch ?? Number(runId),
    blockNumber: completion ? Number(completion.blockNumber) : (signal?.epoch ?? 0),
    txHash: completion?.txHash,
    reasoningSummary: signal?.reasoningSummary,
    ruleBased,
    stages: buildStages(price, resolved.funding, resolved.fearGreed, resolved.news, resolved.fallback),
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
  if (cached?.reasoningSummary) return cached;

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
