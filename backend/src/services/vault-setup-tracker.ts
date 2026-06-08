import { type Address } from 'viem';
import { logger } from '../utils/logger';

const CTX = 'VaultSetupTracker';

export type SetupStepId =
  | 'index'
  | 'mirror-sub'
  | 'stop-sub'
  | 'drawdown-sub'
  | 'epoch-sub'
  | 'fund-cron'
  | 'trigger-pipeline';

export type SetupLogLevel = 'info' | 'warn' | 'success' | 'error';
export type SetupRunStatus = 'idle' | 'running' | 'completed' | 'failed';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface SetupLogEntry {
  ts: string;
  level: SetupLogLevel;
  message: string;
  step?: SetupStepId;
}

export interface SetupTransaction {
  step: SetupStepId;
  label: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface SetupStepState {
  id: SetupStepId;
  label: string;
  status: StepStatus;
  txHash?: string;
  error?: string;
}

export interface VaultSetupState {
  vaultAddress: Address;
  status: SetupRunStatus;
  steps: SetupStepState[];
  transactions: SetupTransaction[];
  logs: SetupLogEntry[];
  deployTxHash?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export const SETUP_STEP_DEFS: { id: SetupStepId; label: string }[] = [
  { id: 'index', label: 'Index vault metadata' },
  { id: 'mirror-sub', label: 'Register MirrorReactor subscription' },
  { id: 'stop-sub', label: 'Register StopReactor subscription' },
  { id: 'drawdown-sub', label: 'Register DrawdownGuard subscription' },
  { id: 'epoch-sub', label: 'Register EpochCron subscription' },
  { id: 'fund-cron', label: 'Fund EpochCron with STT' },
  { id: 'trigger-pipeline', label: 'Trigger first agent pipeline' },
];

function createInitialState(vaultAddress: Address, deployTxHash?: string): VaultSetupState {
  return {
    vaultAddress,
    status: 'idle',
    steps: SETUP_STEP_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      status: 'pending',
    })),
    transactions: [],
    logs: [],
    deployTxHash,
  };
}

const setups = new Map<string, VaultSetupState>();
const activeRuns = new Set<string>();

function key(vault: Address): string {
  return vault.toLowerCase();
}

export function getVaultSetupState(vaultAddress: Address): VaultSetupState {
  const k = key(vaultAddress);
  return setups.get(k) ?? createInitialState(vaultAddress);
}

export function initVaultSetup(vaultAddress: Address, deployTxHash?: string): VaultSetupState {
  const state = createInitialState(vaultAddress, deployTxHash);
  setups.set(key(vaultAddress), state);
  return state;
}

export function isSetupRunning(vaultAddress: Address): boolean {
  return activeRuns.has(key(vaultAddress));
}

export function markSetupRunning(vaultAddress: Address): void {
  const k = key(vaultAddress);
  activeRuns.add(k);
  const state = setups.get(k) ?? createInitialState(vaultAddress);
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.error = undefined;
  setups.set(k, state);
}

export function markSetupCompleted(vaultAddress: Address): void {
  const k = key(vaultAddress);
  activeRuns.delete(k);
  const state = setups.get(k);
  if (!state) return;
  state.status = 'completed';
  state.completedAt = new Date().toISOString();
}

export function markSetupFailed(vaultAddress: Address, error: string): void {
  const k = key(vaultAddress);
  activeRuns.delete(k);
  const state = setups.get(k);
  if (!state) return;
  state.status = 'failed';
  state.error = error;
  state.completedAt = new Date().toISOString();
}

export function setStepStatus(
  vaultAddress: Address,
  stepId: SetupStepId,
  status: StepStatus,
  opts?: { txHash?: string; error?: string },
): void {
  const state = setups.get(key(vaultAddress)) ?? createInitialState(vaultAddress);
  const step = state.steps.find((s) => s.id === stepId);
  if (step) {
    step.status = status;
    if (opts?.txHash) step.txHash = opts.txHash;
    if (opts?.error) step.error = opts.error;
  }
  setups.set(key(vaultAddress), state);
}

export function appendSetupLog(
  vaultAddress: Address,
  level: SetupLogLevel,
  message: string,
  step?: SetupStepId,
): void {
  const state = setups.get(key(vaultAddress)) ?? createInitialState(vaultAddress);
  const entry: SetupLogEntry = { ts: new Date().toISOString(), level, message, step };
  state.logs.push(entry);
  if (state.logs.length > 120) state.logs.shift();
  setups.set(key(vaultAddress), state);
  logger.info(CTX, `[${vaultAddress}] ${message}`, { step });
}

export function addSetupTransaction(
  vaultAddress: Address,
  tx: SetupTransaction,
): void {
  const state = setups.get(key(vaultAddress)) ?? createInitialState(vaultAddress);
  state.transactions.push(tx);
  setups.set(key(vaultAddress), state);
}
