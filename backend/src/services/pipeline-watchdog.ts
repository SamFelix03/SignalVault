import { type Address } from 'viem';
import { publicClient, getWalletClient } from '../config/chains';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { PIPELINE_TIMEOUT_SEC } from '../config/constants';
import { fetchPipelineFallbackData } from './agent-fallback';
import { logger } from '../utils/logger';
import { vaultIndexer } from './vault-indexer';
import { eventBus } from './event-bus';

const CTX = 'PipelineWatchdog';
const POLL_MS = 5_000;

async function finalizeWithFallback(orchestrator: Address, runId: bigint): Promise<`0x${string}`> {
  const fallback = await fetchPipelineFallbackData();
  const walletClient = getWalletClient();

  try {
    return await walletClient.writeContract({
      address: orchestrator,
      abi: AgentOrchestratorABI,
      functionName: 'finalizeStaleRunWithFallback',
      args: [
        runId,
        BigInt(fallback.fearGreedIndex),
        fallback.fetchedFunding,
        fallback.newsSummary,
      ],
      gas: 8_000_000n,
    });
  } catch (err) {
    logger.warn(CTX, 'finalizeStaleRunWithFallback failed — using legacy finalize', err);
    return walletClient.writeContract({
      address: orchestrator,
      abi: AgentOrchestratorABI,
      functionName: 'finalizeStaleRun',
      args: [runId],
      gas: 8_000_000n,
    });
  }
}

/**
 * Watches an in-flight pipeline run. At timeout fetches real HTTP data and finalizes
 * on-chain via finalizeStaleRunWithFallback (overwrites agent placeholders).
 */
export function schedulePipelineWatchdog(orchestrator: Address, runId: bigint): void {
  const deadline = Date.now() + PIPELINE_TIMEOUT_SEC * 1000;

  const timer = setInterval(async () => {
    try {
      const [, flags] = await publicClient.readContract({
        address: orchestrator,
        abi: AgentOrchestratorABI,
        functionName: 'getPipelineStatus',
        args: [runId],
      }) as [number, number, bigint];

      if ((flags & 8) !== 0) {
        clearInterval(timer);
        return;
      }

      if (Date.now() < deadline) return;

      clearInterval(timer);
      logger.info(CTX, `Pipeline run ${runId} timed out — finalizing with HTTP fallback data`, { orchestrator });

      const txHash = await finalizeWithFallback(orchestrator, runId);
      logger.info(CTX, 'Pipeline finalized', { txHash, orchestrator, runId: runId.toString() });

      const vault = vaultIndexer.getVaultByOrchestrator(orchestrator);
      if (vault) {
        eventBus.emitPipelineUpdate(vault.address, { runId: runId.toString(), status: 'completed', txHash });
      }
    } catch (err) {
      logger.error(CTX, 'Pipeline watchdog failed', err);
      clearInterval(timer);
    }
  }, POLL_MS);
}
