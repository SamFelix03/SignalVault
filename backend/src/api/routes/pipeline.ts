import { Router, type Request, type Response } from 'express';
import { type Address, getAddress, parseEther } from 'viem';
import { publicClient, getWalletClient } from '../../config/chains';
import { vaultIndexer } from '../../services/vault-indexer';
import {
  appendPipelineLog,
  ensurePipelineWatchdog,
  getPipelineLogs,
  syncPipelineRun,
} from '../../services/pipeline-run-tracker';
import { AgentOrchestratorABI } from '../../abis/AgentOrchestrator';
import { JSON_FETCH_COST, LLM_PARSE_COST, LLM_INFER_COST } from '../../config/constants';
import { logger } from '../../utils/logger';
import { eventBus } from '../../services/event-bus';
import { fetchPipelineFallbackData } from '../../services/agent-fallback';
import {
  isPlaceholderPipelineText,
  sanitizePipelineText,
} from '../../utils/sanitize-pipeline-text';

const CTX = 'PipelineRoutes';
export const pipelineRouter = Router();

pipelineRouter.get('/:vaultAddress', async (req: Request, res: Response) => {
  try {
    const vaultAddress = getAddress(req.params.vaultAddress as string) as Address;
    const vault = vaultIndexer.getVault(vaultAddress);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    const orchestratorAddress = vault.orchestrator;

    const currentRunId = await publicClient.readContract({
      address: orchestratorAddress,
      abi: AgentOrchestratorABI,
      functionName: 'currentRunId',
    }) as bigint;

    if (currentRunId === 0n) {
      res.json({
        runId: '0',
        stage: 0,
        flags: 0,
        startedAt: '0',
        completed: false,
        data: null,
      });
      return;
    }

    const [status, data] = await Promise.all([
      publicClient.readContract({
        address: orchestratorAddress,
        abi: AgentOrchestratorABI,
        functionName: 'getPipelineStatus',
        args: [currentRunId],
      }) as Promise<[number, number, bigint]>,
      publicClient.readContract({
        address: orchestratorAddress,
        abi: AgentOrchestratorABI,
        functionName: 'getPipelineData',
        args: [currentRunId],
      }) as Promise<[bigint, bigint, bigint, string]>,
    ]);

    const flags = status[1];
    const completed = (flags & 8) !== 0;
    const sync = await syncPipelineRun(orchestratorAddress, currentRunId);

    let newsSummary = String(data[3] ?? '');
    if (isPlaceholderPipelineText(newsSummary)) {
      try {
        const fallback = await fetchPipelineFallbackData();
        newsSummary = fallback.newsSummary;
      } catch {
        newsSummary = sanitizePipelineText(newsSummary);
      }
    } else {
      newsSummary = sanitizePipelineText(newsSummary);
    }

    res.json({
      runId: currentRunId.toString(),
      stage: status[0],
      flags,
      startedAt: status[2].toString(),
      completed,
      staleInSec: sync.staleIn,
      watchdogActive: sync.watchdogActive,
      logs: getPipelineLogs(orchestratorAddress, currentRunId),
      data: {
        fetchedPrice: data[0].toString(),
        fetchedFunding: data[1].toString(),
        fearGreedIndex: data[2].toString(),
        newsSummary,
      },
    });
  } catch (err) {
    logger.error(CTX, 'Failed to get pipeline status', err);
    res.status(500).json({ error: 'Failed to fetch pipeline status' });
  }
});

pipelineRouter.post('/:vaultAddress/trigger', async (req: Request, res: Response) => {
  try {
    const vaultAddress = getAddress(req.params.vaultAddress as string) as Address;
    const vault = vaultIndexer.getVault(vaultAddress);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    const orchestratorAddress = vault.orchestrator;

    const currentRunId = await publicClient.readContract({
      address: orchestratorAddress,
      abi: AgentOrchestratorABI,
      functionName: 'currentRunId',
    }) as bigint;

    if (currentRunId > 0n) {
      const [, flags] = await publicClient.readContract({
        address: orchestratorAddress,
        abi: AgentOrchestratorABI,
        functionName: 'getPipelineStatus',
        args: [currentRunId],
      }) as [number, number, bigint];

      if ((flags & 8) === 0) {
        res.status(409).json({
          error: 'Pipeline already running',
          runId: currentRunId.toString(),
        });
        return;
      }
    }

    const walletClient = getWalletClient();
    const agentBudget = JSON_FETCH_COST + LLM_PARSE_COST + LLM_INFER_COST;

    const txHash = await walletClient.writeContract({
      address: orchestratorAddress,
      abi: AgentOrchestratorABI,
      functionName: 'startPipeline',
      value: parseEther(agentBudget.toString()),
      gas: 8_000_000n,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const runId = await publicClient.readContract({
      address: orchestratorAddress,
      abi: AgentOrchestratorABI,
      functionName: 'currentRunId',
    }) as bigint;

    appendPipelineLog(orchestratorAddress, runId, 'info', `Pipeline started (tx ${txHash})`);
    ensurePipelineWatchdog(orchestratorAddress, runId);
    eventBus.emitPipelineUpdate(vaultAddress, { runId: runId.toString(), status: 'started', txHash });

    logger.info(CTX, `Triggered pipeline for vault ${vaultAddress}`, { txHash, runId: runId.toString() });
    res.json({
      txHash,
      vault: vaultAddress,
      orchestrator: orchestratorAddress,
      runId: runId.toString(),
    });
  } catch (err) {
    logger.error(CTX, 'Failed to trigger pipeline', err);
    res.status(500).json({ error: 'Failed to trigger pipeline' });
  }
});
