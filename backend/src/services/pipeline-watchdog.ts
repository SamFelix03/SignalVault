import { type Address } from 'viem';
import { publicClient, getWalletClient } from '../config/chains';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { PIPELINE_TIMEOUT_SEC } from '../config/constants';
import { fetchPipelineFallbackData } from './agent-fallback';
import { appendPipelineLog } from './pipeline-run-tracker';
import { logger } from '../utils/logger';
import { vaultIndexer } from './vault-indexer';
import { eventBus } from './event-bus';

const CTX = 'PipelineWatchdog';
const POLL_MS = 5_000;
/** finalizeStaleRunWithFallback + updateSignal can exceed 8M on Somnia */
const FINALIZE_GAS = 12_000_000n;

async function sendFinalize(
  orchestrator: Address,
  runId: bigint,
  fn: 'finalizeStaleRunWithFallback' | 'finalizeStaleRun',
  args?: [bigint, bigint, bigint, string],
): Promise<`0x${string}`> {
  const walletClient = getWalletClient();

  if (fn === 'finalizeStaleRunWithFallback' && args) {
    return walletClient.writeContract({
      address: orchestrator,
      abi: AgentOrchestratorABI,
      functionName: 'finalizeStaleRunWithFallback',
      args,
      gas: FINALIZE_GAS,
    });
  }

  return walletClient.writeContract({
    address: orchestrator,
    abi: AgentOrchestratorABI,
    functionName: 'finalizeStaleRun',
    args: [runId],
    gas: FINALIZE_GAS,
  });
}

async function finalizeWithFallback(orchestrator: Address, runId: bigint): Promise<`0x${string}`> {
  const fallback = await fetchPipelineFallbackData();
  const newsSummary = fallback.newsSummary.slice(0, 200);

  try {
    const txHash = await sendFinalize(orchestrator, runId, 'finalizeStaleRunWithFallback', [
      runId,
      BigInt(fallback.fearGreedIndex),
      fallback.fetchedFunding,
      newsSummary,
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status === 'success') return txHash;
    logger.warn(CTX, 'finalizeStaleRunWithFallback reverted on-chain', { txHash, gasUsed: receipt.gasUsed });
  } catch (err) {
    logger.warn(CTX, 'finalizeStaleRunWithFallback failed — using legacy finalize', err);
  }

  const legacyHash = await sendFinalize(orchestrator, runId, 'finalizeStaleRun');
  const legacyReceipt = await publicClient.waitForTransactionReceipt({ hash: legacyHash });
  if (legacyReceipt.status !== 'success') {
    throw new Error(`finalizeStaleRun reverted (tx ${legacyHash})`);
  }
  return legacyHash;
}

/**
 * Watches an in-flight pipeline run. At timeout fetches real HTTP data and finalizes
 * on-chain via finalizeStaleRunWithFallback (overwrites agent placeholders).
 */
export function schedulePipelineWatchdog(orchestrator: Address, runId: bigint): void {
  const timer = setInterval(async () => {
    try {
      const [, flags, startedAt] = await publicClient.readContract({
        address: orchestrator,
        abi: AgentOrchestratorABI,
        functionName: 'getPipelineStatus',
        args: [runId],
      }) as [number, number, bigint];

      if ((flags & 8) !== 0) {
        clearInterval(timer);
        return;
      }

      const finalizeAt = Number(startedAt) * 1000 + PIPELINE_TIMEOUT_SEC * 1000;
      if (Date.now() < finalizeAt) return;

      logger.info(CTX, `Pipeline run ${runId} timed out — finalizing`, { orchestrator });

      const txHash = await finalizeWithFallback(orchestrator, runId);
      appendPipelineLog(orchestrator, runId, 'success', 'Pipeline completed');
      logger.info(CTX, 'Pipeline finalized', { txHash, orchestrator, runId: runId.toString() });

      clearInterval(timer);

      const vault = vaultIndexer.getVaultByOrchestrator(orchestrator);
      if (vault) {
        eventBus.emitPipelineUpdate(vault.address, { runId: runId.toString(), status: 'completed', txHash });
      }
    } catch (err) {
      logger.error(CTX, 'Pipeline watchdog failed — will retry', err);
      // Keep polling; next tick retries finalize after timeout
    }
  }, POLL_MS);
}
