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
import { vaultIndexer, isCustomAgentVault } from './vault-indexer';
import { computeOnChainSignalHash } from './mirror-worker';
import { receiptStore, type Receipt, type ReceiptStage } from './receipt-store';
import { fetchPipelineFallbackData, resolveMacroNewsSummary, type PipelineFallbackData } from './agent-fallback';
import { fetchEthUsdCents } from './mark-price';
import { decodeSignalUpdated } from '../utils/decoder';
import { logger } from '../utils/logger';
import {
  buildDisplayReasoning,
  isPlaceholderPipelineText,
  sanitizePipelineText,
} from '../utils/sanitize-pipeline-text';

const CTX = 'ReceiptBuilder';

function isPlaceholderPipelineData(fearGreed: bigint, news: string): boolean {
  return isPlaceholderPipelineText(news);
}

function buildStages(
  price: bigint,
  funding: bigint,
  fearGreed: bigint,
  news: string,
  fallback?: PipelineFallbackData,
): ReceiptStage[] {
  const fngUrl = fallback?.sources.fearGreed ?? 'https://api.alternative.me/fng/';
  const fundingUrl = fallback?.sources.funding ?? 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum';
  const newsUrl = fallback?.sources.news ?? 'https://www.coindesk.com/arc/outboundfeeds/rss/';

  return [
    {
      stage: 'json_api_price',
      type: 'oracle',
      url: 'protofire ETH/USD oracle',
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
        summary: sanitizePipelineText(news),
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
    return { funding, fearGreed, news: await resolveMacroNewsSummary(news) };
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
  const vault = vaultIndexer.getVaultByOrchestrator(orchestrator);
  if (isCustomAgentVault(vault)) return null;

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

async function signalForHash(
  vaultAddress: Address,
  reasoningHash: string,
): Promise<{
  epoch: number;
  reasoningSummary: string;
  direction: number;
  sizeBps: number;
  marketId: string;
  limitPrice: string;
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
    marketId: string;
    limitPrice: bigint;
  }>;

  const match = history.find((s) => s.reasoningHash.toLowerCase() === reasoningHash.toLowerCase());
  if (!match) return null;

  return {
    epoch: Number(match.epoch),
    reasoningSummary: match.reasoningSummary,
    direction: Number(match.direction),
    sizeBps: Number(match.sizeBps),
    marketId: match.marketId,
    limitPrice: match.limitPrice.toString(),
  };
}

async function signalEpochForHash(vaultAddress: Address, reasoningHash: string): Promise<number | null> {
  const signal = await signalForHash(vaultAddress, reasoningHash);
  return signal?.epoch ?? null;
}

const SIGNAL_UPDATED = parseAbiItem(
  'event SignalUpdated(bytes32 indexed signalHash, int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, string reasoningSummary, bytes32 reasoningHash)',
);

async function getSignalUpdatedLogsInChunks(
  vaultAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end = start + MAX_LOG_RANGE > toBlock ? toBlock : start + MAX_LOG_RANGE;
    const batch = await publicClient.getLogs({
      address: vaultAddress,
      event: SIGNAL_UPDATED,
      fromBlock: start,
      toBlock: end,
    });
    logs.push(...batch);
    start = end + 1n;
  }

  return logs;
}

async function findSignalUpdatedLog(
  vaultAddress: Address,
  reasoningHash: string,
  nearBlock?: number,
): Promise<{ blockNumber: bigint; txHash: Hex } | null> {
  const latest = await publicClient.getBlockNumber();

  let fromBlock: bigint;
  let toBlock: bigint;
  if (nearBlock != null && nearBlock > 0) {
    fromBlock = BigInt(Math.max(nearBlock - 50, 0));
    toBlock = BigInt(nearBlock + 50) > latest ? latest : BigInt(nearBlock + 50);
  } else {
    fromBlock = latest > 5000n ? latest - 5000n : 0n;
    toBlock = latest;
  }

  const logs = await getSignalUpdatedLogsInChunks(vaultAddress, fromBlock, toBlock);
  const normalized = reasoningHash.toLowerCase();

  for (const log of logs) {
    try {
      const decoded = decodeSignalUpdated(log);
      if (decoded.reasoningHash.toLowerCase() === normalized) {
        return {
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function buildCustomAgentReceipt(
  vaultAddress: Address,
  reasoningHash: string,
): Promise<Receipt | null> {
  const signal = await signalForHash(vaultAddress, reasoningHash);
  if (!signal) return null;

  const vault = vaultIndexer.getVault(vaultAddress);
  const completion = await findSignalUpdatedLog(vaultAddress, reasoningHash, signal.epoch);

  let fallback: PipelineFallbackData | undefined;
  let price = 0n;
  let funding = 0n;
  let fearGreed = 50n;
  let news = '';

  try {
    const [fallbackData, oracleCents] = await Promise.all([
      fetchPipelineFallbackData(),
      fetchEthUsdCents(),
    ]);
    fallback = fallbackData;
    price = BigInt(oracleCents);
    funding = fallbackData.fetchedFunding;
    fearGreed = BigInt(fallbackData.fearGreedIndex);
    news = fallbackData.newsSummary;
  } catch (err) {
    logger.warn(CTX, 'Custom receipt market data fetch failed', err);
  }

  const displayReasoning = sanitizePipelineText(signal.reasoningSummary);

  return {
    hash: reasoningHash,
    vaultAddress,
    orchestrator: vault?.orchestrator,
    epoch: signal.epoch,
    blockNumber: completion ? Number(completion.blockNumber) : signal.epoch,
    txHash: completion?.txHash,
    reasoningSummary: displayReasoning,
    ruleBased: displayReasoning.toLowerCase().includes('rule-based'),
    publisherKind: 'custom',
    signalDirection: signal.direction,
    signalSizeBps: signal.sizeBps,
    stages: buildStages(price, funding, fearGreed, news, fallback),
  };
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

  const displayNews = sanitizePipelineText(resolved.news);
  const displayReasoning = buildDisplayReasoning(signal?.reasoningSummary, displayNews);

  return {
    hash: reasoningHash,
    vaultAddress,
    orchestrator,
    runId: Number(runId),
    epoch: signal?.epoch ?? Number(runId),
    blockNumber: completion ? Number(completion.blockNumber) : (signal?.epoch ?? 0),
    txHash: completion?.txHash,
    reasoningSummary: displayReasoning,
    ruleBased: false,
    stages: buildStages(price, resolved.funding, resolved.fearGreed, displayNews, resolved.fallback),
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

/** Map on-chain signalHash (from mirror trades) to pipeline reasoningHash used by receipts. */
export async function resolveReceiptLookupHash(
  hash: string,
  vaultAddress?: Address,
): Promise<string> {
  if (receiptStore.get(hash)) return hash;

  const candidates = vaultAddress
    ? [vaultIndexer.getVault(vaultAddress)].filter((v) => v != null)
    : vaultIndexer.getAllVaults();

  for (const vault of candidates) {
    const reasoningHash = await reasoningHashForSignalHash(vault.address, hash);
    if (reasoningHash) return reasoningHash;
  }

  return hash;
}

async function reasoningHashForSignalHash(
  vaultAddress: Address,
  signalHash: string,
): Promise<string | null> {
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
    direction: number;
    sizeBps: number;
    marketId: string;
    limitPrice: bigint;
    epoch: bigint;
    reasoningHash: string;
  }>;

  const normalized = signalHash.toLowerCase();
  for (const signal of history) {
    const computed = computeOnChainSignalHash(
      signal.direction,
      signal.sizeBps,
      signal.marketId as Hex,
      signal.limitPrice,
      signal.epoch,
    );
    if (computed.toLowerCase() === normalized) {
      return signal.reasoningHash;
    }
  }

  return null;
}

export async function getOrBuildReceipt(
  reasoningHash: string,
  vaultAddress?: Address,
): Promise<Receipt | null> {
  const lookupHash = await resolveReceiptLookupHash(reasoningHash, vaultAddress);

  const cached = receiptStore.get(lookupHash);
  if (cached?.reasoningSummary) return cached;

  const candidates = vaultAddress
    ? [vaultIndexer.getVault(vaultAddress)].filter((v) => v != null)
    : vaultIndexer.getAllVaults();

  for (const vault of candidates) {
    if (isCustomAgentVault(vault)) {
      const customReceipt = await buildCustomAgentReceipt(vault.address, lookupHash);
      if (customReceipt) {
        receiptStore.store(customReceipt);
        logger.info(CTX, `Built custom-agent receipt ${lookupHash} for vault ${vault.address}`);
        return customReceipt;
      }
      continue;
    }

    let runId = await findRunIdForReasoningHash(vault.orchestrator, lookupHash);

    if (runId === null) {
      const epoch = await signalEpochForHash(vault.address, lookupHash);
      if (epoch !== null) {
        runId = await findRunIdBySignalEpoch(vault.orchestrator, epoch);
      }
    }

    if (runId === null) continue;

    const receipt = await buildReceiptFromRun(
      vault.address,
      vault.orchestrator,
      runId,
      lookupHash,
    );

    receiptStore.store(receipt);
    logger.info(CTX, `Built receipt ${lookupHash} for vault ${vault.address} run ${runId}`);
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

    if (isCustomAgentVault(vault)) {
      const receipt = await buildCustomAgentReceipt(vaultAddress, signal.reasoningHash);
      if (receipt) {
        receiptStore.store(receipt);
        stored++;
      }
      continue;
    }

    const receipt = await getOrBuildReceipt(signal.reasoningHash, vaultAddress);
    if (receipt) stored++;
  }

  return stored;
}
