import {
  type Address,
  type Hex,
  decodeEventLog,
  getAddress,
  parseEther,
} from 'viem';
import { publicClient, getWalletClient, config, getKnownFactoryAddresses } from '../config/chains';
import {
  VaultFactoryABI,
  LegacyVaultFactoryABI,
  LegacyVaultDeployedEventABI,
  VAULT_DEPLOYED_TOPICS,
} from '../abis/VaultFactory';
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

/** Indexed event topics are 32-byte words; addresses occupy the low 20 bytes. */
function addressFromTopic(topic: Hex): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}

async function getDeployReceipt(txHash: Hex) {
  const delaysMs = [0, 1500, 3000];
  let lastErr: unknown;
  for (const delayMs of delaysMs) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      return await publicClient.getTransactionReceipt({ hash: txHash });
    } catch (err) {
      lastErr = err;
      logger.warn(CTX, 'Receipt not available yet — retrying', {
        txHash,
        delayMs,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch deploy receipt');
}

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

type FactoryDeployment = {
  vault: Address;
  orchestrator: Address;
  mirrorReactor: Address;
  stopReactor: Address;
  drawdownGuard: Address;
  epochCron: Address;
  performanceLedger: Address;
  feeDistributor: Address;
};

async function readFactoryDeployment(
  factoryAddress: Address,
  vaultId: bigint,
): Promise<FactoryDeployment> {
  try {
    const dep = await publicClient.readContract({
      address: factoryAddress,
      abi: VaultFactoryABI,
      functionName: 'getDeployment',
      args: [vaultId],
    }) as FactoryDeployment & { eventRouter?: Address; strategist: Address; deployedAt: bigint };

    return {
      vault: getAddress(dep.vault),
      orchestrator: getAddress(dep.orchestrator),
      mirrorReactor: getAddress(dep.mirrorReactor),
      stopReactor: getAddress(dep.stopReactor),
      drawdownGuard: getAddress(dep.drawdownGuard),
      epochCron: getAddress(dep.epochCron),
      performanceLedger: getAddress(dep.performanceLedger),
      feeDistributor: getAddress(dep.feeDistributor),
    };
  } catch (err) {
    logger.warn(CTX, 'getDeployment with current ABI failed — trying legacy tuple', {
      factory: factoryAddress,
      vaultId: vaultId.toString(),
      error: err instanceof Error ? err.message : String(err),
    });

    const dep = await publicClient.readContract({
      address: factoryAddress,
      abi: LegacyVaultFactoryABI,
      functionName: 'getDeployment',
      args: [vaultId],
    }) as FactoryDeployment & { strategist: Address; deployedAt: bigint };

    return {
      vault: getAddress(dep.vault),
      orchestrator: getAddress(dep.orchestrator),
      mirrorReactor: getAddress(dep.mirrorReactor),
      stopReactor: getAddress(dep.stopReactor),
      drawdownGuard: getAddress(dep.drawdownGuard),
      epochCron: getAddress(dep.epochCron),
      performanceLedger: getAddress(dep.performanceLedger),
      feeDistributor: getAddress(dep.feeDistributor),
    };
  }
}

export async function resolveVaultFromDeployTx(txHash: Hex): Promise<ResolvedDeployment> {
  const knownFactories = getKnownFactoryAddresses();
  const knownFactorySet = new Set(knownFactories.map((a) => a.toLowerCase()));

  logger.info(CTX, 'Resolving deploy transaction', {
    txHash,
    configuredFactory: config.vaultFactoryAddress,
    knownFactories,
    expectedVaultDeployedTopics: [...VAULT_DEPLOYED_TOPICS],
  });

  const receipt = await getDeployReceipt(txHash);
  if (receipt.status !== 'success') {
    logger.error(CTX, 'Deploy transaction reverted on-chain', { txHash, status: receipt.status });
    throw new Error('Deploy transaction failed on-chain');
  }

  logger.info(CTX, 'Deploy receipt loaded', {
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    logCount: receipt.logs.length,
    to: receipt.to,
  });

  const logSummary = receipt.logs.map((log, i) => ({
    index: i,
    address: log.address,
    isKnownFactory: knownFactorySet.has(log.address.toLowerCase()),
    topic0: log.topics[0] ?? null,
    topicCount: log.topics.length,
    dataBytes: (log.data.length - 2) / 2,
  }));
  logger.info(CTX, 'Receipt logs summary', { txHash, logs: logSummary });

  const decodeErrors: string[] = [];

  for (const log of receipt.logs) {
    const isKnownFactory = knownFactorySet.has(log.address.toLowerCase());
    const topic0 = log.topics[0];
    const isVaultDeployedTopic =
      topic0 !== undefined && (VAULT_DEPLOYED_TOPICS as readonly string[]).includes(topic0);

    if (!isKnownFactory && !isVaultDeployedTopic) continue;

    if (!isKnownFactory && isVaultDeployedTopic) {
      logger.warn(CTX, 'VaultDeployed topic from unknown factory address', {
        txHash,
        logAddress: log.address,
        topic0,
        knownFactories,
      });
    }

    const factoryAddress = getAddress(log.address);

    // Path A: full ABI decode (current + legacy event shapes)
    for (const abi of [VaultFactoryABI, LegacyVaultDeployedEventABI] as const) {
      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName !== 'VaultDeployed') continue;

        const args = decoded.args as {
          vaultId: bigint;
          vault: Address;
          strategist: Address;
        };

        logger.info(CTX, 'VaultDeployed decoded via ABI', {
          txHash,
          factory: factoryAddress,
          abi: abi === VaultFactoryABI ? 'current' : 'legacy',
          vaultId: args.vaultId.toString(),
          vault: args.vault,
          strategist: args.strategist,
        });

        const dep = await readFactoryDeployment(factoryAddress, args.vaultId);

        return {
          vaultAddress: getAddress(args.vault),
          vaultId: args.vaultId,
          strategist: getAddress(args.strategist),
          orchestrator: dep.orchestrator,
          mirrorReactor: dep.mirrorReactor,
          stopReactor: dep.stopReactor,
          drawdownGuard: dep.drawdownGuard,
          epochCron: dep.epochCron,
          performanceLedger: dep.performanceLedger,
          feeDistributor: dep.feeDistributor,
          deployTxHash: txHash,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        decodeErrors.push(
          `factory=${factoryAddress} abi=${abi === VaultFactoryABI ? 'current' : 'legacy'}: ${msg}`,
        );
      }
    }

    // Path B: indexed topics only (vaultId, vault, strategist are always indexed)
    if (isVaultDeployedTopic && log.topics.length >= 4) {
      try {
        const vaultId = BigInt(log.topics[1]!);
        const vault = addressFromTopic(log.topics[2]!);
        const strategist = addressFromTopic(log.topics[3]!);

        logger.info(CTX, 'VaultDeployed parsed from indexed topics', {
          txHash,
          factory: factoryAddress,
          topic0,
          vaultId: vaultId.toString(),
          vault,
          strategist,
        });

        const dep = await readFactoryDeployment(factoryAddress, vaultId);

        return {
          vaultAddress: vault,
          vaultId,
          strategist,
          orchestrator: dep.orchestrator,
          mirrorReactor: dep.mirrorReactor,
          stopReactor: dep.stopReactor,
          drawdownGuard: dep.drawdownGuard,
          epochCron: dep.epochCron,
          performanceLedger: dep.performanceLedger,
          feeDistributor: dep.feeDistributor,
          deployTxHash: txHash,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        decodeErrors.push(`factory=${factoryAddress} indexed-topics: ${msg}`);
      }
    }
  }

  logger.error(CTX, 'VaultDeployed event not found in transaction receipt', {
    txHash,
    configuredFactory: config.vaultFactoryAddress,
    knownFactories,
    receiptTo: receipt.to,
    logAddresses: [...new Set(receipt.logs.map((l) => l.address))],
    decodeErrors,
    hint:
      'If logAddresses does not include your VAULT_FACTORY_ADDRESS, the frontend deployed to a different factory than the backend expects. Restart backend after updating backend/.env.',
  });

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
