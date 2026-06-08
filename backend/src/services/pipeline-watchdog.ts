import { type Address } from 'viem';
import { publicClient, getWalletClient } from '../config/chains';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { PIPELINE_TIMEOUT_SEC } from '../config/constants';
import { logger } from '../utils/logger';
import { vaultIndexer } from './vault-indexer';
import { eventBus } from './event-bus';

const CTX = 'PipelineWatchdog';
const POLL_MS = 5_000;

/**
 * Watches an in-flight pipeline run. If Somnia agents have not completed within
 * PIPELINE_TIMEOUT_SEC, finalizes on-chain with the orchestrator's rule-based signal.
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
      logger.info(CTX, `Pipeline run ${runId} timed out — completing with rule-based signal`, { orchestrator });

      const walletClient = getWalletClient();
      const txHash = await walletClient.writeContract({
        address: orchestrator,
        abi: AgentOrchestratorABI,
        functionName: 'finalizeStaleRun',
        args: [runId],
        gas: 8_000_000n,
      });
      logger.info(CTX, 'Rule-based completion submitted', { txHash, orchestrator, runId: runId.toString() });
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
