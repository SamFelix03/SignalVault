import { Router, type Request, type Response } from 'express';
import { type Address, getAddress, parseEther } from 'viem';
import { publicClient, getWalletClient } from '../../config/chains';
import { vaultIndexer } from '../../services/vault-indexer';
import { AgentOrchestratorABI } from '../../abis/AgentOrchestrator';
import { JSON_FETCH_COST, LLM_PARSE_COST, LLM_INFER_COST } from '../../config/constants';
import { logger } from '../../utils/logger';

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
      res.json({ runId: '0', stage: 0, flags: 0, startedAt: '0', data: null });
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

    res.json({
      runId: currentRunId.toString(),
      stage: status[0],
      flags: status[1],
      startedAt: status[2].toString(),
      data: {
        fetchedPrice: data[0].toString(),
        fetchedFunding: data[1].toString(),
        fearGreedIndex: data[2].toString(),
        newsSummary: data[3],
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
    const walletClient = getWalletClient();
    const totalCost = JSON_FETCH_COST + LLM_PARSE_COST + LLM_INFER_COST;

    const txHash = await walletClient.writeContract({
      address: orchestratorAddress,
      abi: AgentOrchestratorABI,
      functionName: 'startPipeline',
      value: parseEther(totalCost.toString()),
    });

    logger.info(CTX, `Triggered pipeline for vault ${vaultAddress}`, { txHash });
    res.json({ txHash, vault: vaultAddress, orchestrator: orchestratorAddress });
  } catch (err) {
    logger.error(CTX, 'Failed to trigger pipeline', err);
    res.status(500).json({ error: 'Failed to trigger pipeline' });
  }
});
