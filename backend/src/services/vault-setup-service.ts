import {
  type Address,
  type Hex,
  decodeEventLog,
  getAddress,
  parseEther,
} from 'viem';
import { publicClient, getWalletClient, config } from '../config/chains';
import { VaultFactoryABI } from '../abis/VaultFactory';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { JSON_FETCH_COST, LLM_PARSE_COST, LLM_INFER_COST } from '../config/constants';
import { vaultIndexer } from './vault-indexer';
import { followerVaultIndex } from './follower-vault-index';
import { registerReactivitySubscription, buildVaultSubscriptionTargets } from './reactivity-subscriptions';
import {
  appendSetupLog,
  addSetupTransaction,
  getVaultSetupState,
  initVaultSetup,
  isSetupRunning,
  markSetupRunning,
  markSetupCompleted,
  markSetupFailed,
  setStepStatus,
  type SetupStepId,
} from './vault-setup-tracker';
import {
  appendPipelineLog,
  ensurePipelineWatchdog,
} from './pipeline-run-tracker';
import { eventBus } from './event-bus';
import { logger } from '../utils/logger';

const CTX = 'VaultSetupService';

export interface SetupOptions {
  deployTxHash?: string;
  fundEpochCron?: boolean;
  epochCronStt?: string;
  triggerPipeline?: boolean;
}

export interface ResolvedDeployment {
  vaultAddress: Address;
  vaultId: bigint;
  strategist: Address;
  orchestrator: Address;
  mirrorReactor: Address;
  stopReactor: Address;
  drawdownGuard: Address;
  epochCron: Address;
  performanceLedger: Address;
  feeDistributor: Address;
  deployTxHash?: Hex;
}

const STEP_BY_SUB_NAME: Record<string, SetupStepId> = {
  MirrorReactor: 'mirror-sub',
  StopReactor: 'stop-sub',
  DrawdownGuard: 'drawdown-sub',
  EpochCron: 'epoch-sub',
};

export async function resolveVaultFromDeployTx(txHash: Hex): Promise<ResolvedDeployment> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error('Deploy transaction failed on-chain');
  }

  if (!config.vaultFactoryAddress) {
    throw new Error('VAULT_FACTORY_ADDRESS not configured');
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.vaultFactoryAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: VaultFactoryABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== 'VaultDeployed') continue;

      const args = decoded.args as {
        vaultId: bigint;
        vault: Address;
        strategist: Address;
        orchestrator: Address;
        mirrorReactor: Address;
        stopReactor: Address;
        drawdownGuard: Address;
        epochCron: Address;
      };

      const dep = await publicClient.readContract({
        address: config.vaultFactoryAddress,
        abi: VaultFactoryABI,
        functionName: 'getDeployment',
        args: [args.vaultId],
      }) as {
        vault: Address;
        orchestrator: Address;
        mirrorReactor: Address;
        stopReactor: Address;
        drawdownGuard: Address;
        epochCron: Address;
        performanceLedger: Address;
        feeDistributor: Address;
        strategist: Address;
      };

      return {
        vaultAddress: getAddress(args.vault),
        vaultId: args.vaultId,
        strategist: getAddress(args.strategist),
        orchestrator: getAddress(dep.orchestrator),
        mirrorReactor: getAddress(dep.mirrorReactor),
        stopReactor: getAddress(dep.stopReactor),
        drawdownGuard: getAddress(dep.drawdownGuard),
        epochCron: getAddress(dep.epochCron),
        performanceLedger: getAddress(dep.performanceLedger),
        feeDistributor: getAddress(dep.feeDistributor),
        deployTxHash: txHash,
      };
    } catch {
      // not a VaultDeployed log
    }
  }

  throw new Error('VaultDeployed event not found in transaction receipt');
}

export async function runVaultSetup(
  vaultAddress: Address,
  options: SetupOptions = {},
): Promise<void> {
  const vault = getAddress(vaultAddress);

  if (isSetupRunning(vault)) {
    appendSetupLog(vault, 'warn', 'Setup already in progress');
    return;
  }

  initVaultSetup(vault, options.deployTxHash);
  markSetupRunning(vault);
  appendSetupLog(vault, 'info', 'Starting post-deploy vault setup');

  try {
    // Step 1: Force index vault
    setStepStatus(vault, 'index', 'running');
    appendSetupLog(vault, 'info', 'Indexing vault from factory registry…', 'index');

    const indexed = await vaultIndexer.forceIndexVault(vault);
    if (!indexed) {
      throw new Error('Vault not found in factory registry — wait for deploy confirmation');
    }

    await followerVaultIndex.syncVault(vault);
    setStepStatus(vault, 'index', 'completed');
    appendSetupLog(vault, 'success', `Indexed vault #${indexed.vaultId}: ${vault}`, 'index');
    eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));

    const deployment = {
      vault,
      mirrorReactor: indexed.mirrorReactor,
      stopReactor: indexed.stopReactor,
      drawdownGuard: indexed.drawdownGuard,
      epochCron: indexed.epochCron,
      performanceLedger: indexed.performanceLedger,
    };

    // Steps 2-5: Reactivity subscriptions
    const targets = buildVaultSubscriptionTargets(deployment);
    for (const target of targets) {
      const stepId = STEP_BY_SUB_NAME[target.name];
      if (!stepId) continue;

      setStepStatus(vault, stepId, 'running');
      appendSetupLog(vault, 'info', `Registering ${target.name} on Somnia Reactivity…`, stepId);

      const result = await registerReactivitySubscription(target);

      if (result.status === 'success' && result.txHash !== '0x') {
        addSetupTransaction(vault, {
          step: stepId,
          label: target.name,
          txHash: result.txHash,
          status: 'confirmed',
        });
        setStepStatus(vault, stepId, 'completed', { txHash: result.txHash });
        appendSetupLog(
          vault,
          'success',
          `${target.name} subscription confirmed (tx ${result.txHash.slice(0, 10)}…)`,
          stepId,
        );
      } else {
        setStepStatus(vault, stepId, 'failed', { error: result.error });
        appendSetupLog(
          vault,
          'error',
          `${target.name} subscription failed: ${result.error ?? 'unknown error'}`,
          stepId,
        );
      }

      eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
    }

    // Step 6: Fund epoch cron
    const shouldFund = options.fundEpochCron !== false;
    if (shouldFund) {
      setStepStatus(vault, 'fund-cron', 'running');
      const amount = parseEther(options.epochCronStt ?? '0.5');
      appendSetupLog(
        vault,
        'info',
        `Funding EpochCron ${indexed.epochCron} with ${options.epochCronStt ?? '0.5'} STT…`,
        'fund-cron',
      );

      try {
        const walletClient = getWalletClient();
        const hash = await walletClient.sendTransaction({
          to: indexed.epochCron,
          value: amount,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          addSetupTransaction(vault, {
            step: 'fund-cron',
            label: 'Fund EpochCron',
            txHash: hash,
            status: 'confirmed',
          });
          setStepStatus(vault, 'fund-cron', 'completed', { txHash: hash });
          appendSetupLog(vault, 'success', `EpochCron funded (tx ${hash.slice(0, 10)}…)`, 'fund-cron');
        } else {
          throw new Error('Fund transaction reverted');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStepStatus(vault, 'fund-cron', 'failed', { error: msg });
        appendSetupLog(vault, 'error', `EpochCron funding failed: ${msg}`, 'fund-cron');
      }

      eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
    } else {
      setStepStatus(vault, 'fund-cron', 'skipped');
      appendSetupLog(vault, 'info', 'Skipped EpochCron funding', 'fund-cron');
    }

    // Step 7: Trigger first pipeline
    const shouldTrigger = options.triggerPipeline !== false;
    if (shouldTrigger) {
      setStepStatus(vault, 'trigger-pipeline', 'running');
      appendSetupLog(vault, 'info', 'Triggering first agent pipeline run…', 'trigger-pipeline');

      try {
        const orchestrator = indexed.orchestrator;
        const currentRunId = await publicClient.readContract({
          address: orchestrator,
          abi: AgentOrchestratorABI,
          functionName: 'currentRunId',
        }) as bigint;

        if (currentRunId > 0n) {
          const [, flags] = await publicClient.readContract({
            address: orchestrator,
            abi: AgentOrchestratorABI,
            functionName: 'getPipelineStatus',
            args: [currentRunId],
          }) as [number, number, bigint];

          if ((flags & 8) === 0) {
            appendSetupLog(vault, 'warn', 'Pipeline already running — skipping trigger', 'trigger-pipeline');
            setStepStatus(vault, 'trigger-pipeline', 'skipped');
            eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
            markSetupCompleted(vault);
            appendSetupLog(vault, 'success', 'Vault setup complete');
            eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
            return;
          }
        }

        const walletClient = getWalletClient();
        const agentBudget = JSON_FETCH_COST + LLM_PARSE_COST + LLM_INFER_COST;
        const hash = await walletClient.writeContract({
          address: orchestrator,
          abi: AgentOrchestratorABI,
          functionName: 'startPipeline',
          value: parseEther(agentBudget.toString()),
          gas: 8_000_000n,
        });

        await publicClient.waitForTransactionReceipt({ hash });

        const runId = await publicClient.readContract({
          address: orchestrator,
          abi: AgentOrchestratorABI,
          functionName: 'currentRunId',
        }) as bigint;

        appendPipelineLog(orchestrator, runId, 'info', `Pipeline started during vault setup (tx ${hash})`);
        ensurePipelineWatchdog(orchestrator, runId);

        addSetupTransaction(vault, {
          step: 'trigger-pipeline',
          label: 'Start Pipeline',
          txHash: hash,
          status: 'confirmed',
        });
        setStepStatus(vault, 'trigger-pipeline', 'completed', { txHash: hash });
        appendSetupLog(
          vault,
          'success',
          `Pipeline run #${runId} started (tx ${hash.slice(0, 10)}…)`,
          'trigger-pipeline',
        );
        eventBus.emitPipelineUpdate(vault, { runId: runId.toString(), status: 'started', txHash: hash });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStepStatus(vault, 'trigger-pipeline', 'failed', { error: msg });
        appendSetupLog(vault, 'error', `Pipeline trigger failed: ${msg}`, 'trigger-pipeline');
      }

      eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
    } else {
      setStepStatus(vault, 'trigger-pipeline', 'skipped');
      appendSetupLog(vault, 'info', 'Skipped pipeline trigger', 'trigger-pipeline');
    }

    const finalState = getVaultSetupState(vault);
    const failedSteps = finalState.steps.filter((s) => s.status === 'failed');
    if (failedSteps.length > 0) {
      markSetupFailed(vault, `${failedSteps.length} setup step(s) failed`);
      appendSetupLog(vault, 'warn', `Setup finished with ${failedSteps.length} failed step(s)`);
    } else {
      markSetupCompleted(vault);
      appendSetupLog(vault, 'success', 'Vault setup complete — vault is live on Somnia');
    }

    eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
    logger.info(CTX, `Setup complete for ${vault}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markSetupFailed(vault, msg);
    appendSetupLog(vault, 'error', `Setup failed: ${msg}`);
    eventBus.emitSetupUpdate(vault, getVaultSetupState(vault));
    logger.error(CTX, `Setup failed for ${vault}`, err);
  }
}
