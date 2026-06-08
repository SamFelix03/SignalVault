import { type Address } from 'viem';
import { publicClient } from '../config/chains';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { PIPELINE_TIMEOUT_SEC } from '../config/constants';
import { vaultIndexer } from './vault-indexer';
import { mirrorWorker } from './mirror-worker';
import { schedulePipelineWatchdog } from './pipeline-watchdog';
import { logger } from '../utils/logger';

const CTX = 'PipelineRunTracker';

export type PipelineLogLevel = 'info' | 'warn' | 'success' | 'error';

export interface PipelineLogEntry {
  ts: string;
  level: PipelineLogLevel;
  message: string;
}

const STAGE_NAMES: Record<number, string> = {
  0: 'Idle',
  1: 'Fetching Price',
  2: 'Fetching Funding',
  3: 'Parsing Fear & Greed',
  4: 'Parsing News',
  5: 'Inferring',
};

function runKey(orchestrator: Address, runId: bigint): string {
  return `${orchestrator.toLowerCase()}:${runId.toString()}`;
}

const logs = new Map<string, PipelineLogEntry[]>();
const watchedRuns = new Set<string>();
const lastSeenStage = new Map<string, number>();
const mirroredCompletedRuns = new Set<string>();

export function appendPipelineLog(
  orchestrator: Address,
  runId: bigint,
  level: PipelineLogLevel,
  message: string,
): void {
  const key = runKey(orchestrator, runId);
  const entry: PipelineLogEntry = { ts: new Date().toISOString(), level, message };
  const list = logs.get(key) ?? [];
  list.push(entry);
  if (list.length > 80) list.shift();
  logs.set(key, list);
  logger.info(CTX, `[run ${runId}] ${message}`, { orchestrator });
}

export function getPipelineLogs(orchestrator: Address, runId: bigint): PipelineLogEntry[] {
  return logs.get(runKey(orchestrator, runId)) ?? [];
}

export function ensurePipelineWatchdog(orchestrator: Address, runId: bigint): boolean {
  const key = runKey(orchestrator, runId);
  if (watchedRuns.has(key)) return false;

  watchedRuns.add(key);
  schedulePipelineWatchdog(orchestrator, runId);
  return true;
}

function recordStageTransition(orchestrator: Address, runId: bigint, stage: number): void {
  const key = runKey(orchestrator, runId);
  const prev = lastSeenStage.get(key);
  if (prev === stage) return;
  lastSeenStage.set(key, stage);
  appendPipelineLog(
    orchestrator,
    runId,
    'info',
    `Stage → ${STAGE_NAMES[stage] ?? `Stage ${stage}`}`,
  );
}

/** Sync logs from on-chain state and ensure watchdog for in-flight runs. */
export async function syncPipelineRun(
  orchestrator: Address,
  runId: bigint,
): Promise<{ staleIn: number; watchdogActive: boolean }> {
  const [stage, flags, startedAt] = await publicClient.readContract({
    address: orchestrator,
    abi: AgentOrchestratorABI,
    functionName: 'getPipelineStatus',
    args: [runId],
  }) as [number, number, bigint];

  const completed = (flags & 8) !== 0;
  const key = runKey(orchestrator, runId);

  if (completed) {
    if (lastSeenStage.get(key) !== 0) {
      recordStageTransition(orchestrator, runId, 0);
      appendPipelineLog(orchestrator, runId, 'success', 'Pipeline completed');
    }
    if (!mirroredCompletedRuns.has(key)) {
      mirroredCompletedRuns.add(key);
      const vault = vaultIndexer.getVaultByOrchestrator(orchestrator);
      if (vault) {
        mirrorWorker.syncVaultSignal(vault.address).catch((err) => {
          logger.warn(CTX, `Mirror sync after pipeline failed for ${vault.address}`, err);
        });
      }
    }
    return { staleIn: 0, watchdogActive: false };
  }

  mirroredCompletedRuns.delete(key);

  recordStageTransition(orchestrator, runId, stage);

  const startedMs = Number(startedAt) * 1000;
  const finalizeAt = startedMs + PIPELINE_TIMEOUT_SEC * 1000;
  const staleIn = Math.max(0, Math.ceil((finalizeAt - Date.now()) / 1000));

  if (stage > 0) {
    ensurePipelineWatchdog(orchestrator, runId);
  }

  return { staleIn, watchdogActive: watchedRuns.has(key) };
}

/** On startup, attach watchdogs to any in-flight pipeline runs. */
export async function recoverInFlightPipelines(): Promise<void> {
  const vaults = vaultIndexer.getAllVaults();
  for (const vault of vaults) {
    try {
      const runId = await publicClient.readContract({
        address: vault.orchestrator,
        abi: AgentOrchestratorABI,
        functionName: 'currentRunId',
      }) as bigint;

      if (runId === 0n) continue;

      const [, flags] = await publicClient.readContract({
        address: vault.orchestrator,
        abi: AgentOrchestratorABI,
        functionName: 'getPipelineStatus',
        args: [runId],
      }) as [number, number, bigint];

      if ((flags & 8) !== 0) continue;

      await syncPipelineRun(vault.orchestrator, runId);
    } catch (err) {
      logger.warn(CTX, `Failed to recover pipeline for vault ${vault.address}`, err);
    }
  }
}
