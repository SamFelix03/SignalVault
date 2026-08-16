import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  parseEther,
} from 'viem'
import { agentOrchestratorAbi } from '@/abis/AgentOrchestrator'
import {
  JSON_FETCH_COST,
  LLM_PARSE_COST,
  LLM_INFER_COST,
} from '@/lib/constants'
import {
  buildVaultSubscriptionTargets,
  encodeReactivitySubscriptionCalldata,
  type SubscriptionTarget,
} from '@/lib/reactivity-subscriptions'
import { REACTIVITY_PRECOMPILE } from '@/lib/constants'
import { API_URL } from '@/lib/contracts'
import type {
  SetupLogEntry,
  SetupStep,
  SetupTransaction,
} from '@/hooks/use-vault-setup'

export interface VaultDeployment {
  vaultAddress: Address
  orchestrator: Address
  mirrorReactor: Address
  stopReactor: Address
  drawdownGuard: Address
  epochCron: Address
  performanceLedger: Address
}

export type SetupStepId =
  | 'index'
  | 'mirror-sub'
  | 'stop-sub'
  | 'drawdown-sub'
  | 'epoch-sub'
  | 'fund-cron'
  | 'trigger-pipeline'

const STEP_DEFS: { id: SetupStepId; label: string }[] = [
  { id: 'index', label: 'Index vault metadata' },
  { id: 'mirror-sub', label: 'Register MirrorReactor subscription' },
  { id: 'stop-sub', label: 'Register StopReactor subscription' },
  { id: 'drawdown-sub', label: 'Register DrawdownGuard subscription' },
  { id: 'epoch-sub', label: 'Register EpochCron subscription' },
  { id: 'fund-cron', label: 'Fund EpochCron with STT' },
  { id: 'trigger-pipeline', label: 'Trigger first agent pipeline' },
]

const STEP_BY_SUB: Record<string, SetupStepId> = {
  MirrorReactor: 'mirror-sub',
  StopReactor: 'stop-sub',
  DrawdownGuard: 'drawdown-sub',
  EpochCron: 'epoch-sub',
}

export function createInitialSetupSteps(customAgent = false): SetupStep[] {
  return STEP_DEFS.map((d) => {
    if (customAgent && (d.id === 'epoch-sub' || d.id === 'fund-cron' || d.id === 'trigger-pipeline')) {
      return { id: d.id, label: d.label, status: 'skipped' as const }
    }
    return { id: d.id, label: d.label, status: 'pending' as const }
  })
}

function log(
  onLog: (entry: SetupLogEntry) => void,
  level: SetupLogEntry['level'],
  message: string,
  step?: string,
) {
  onLog({ ts: new Date().toISOString(), level, message, step })
}

async function indexVaultOnBackend(vaultAddress: Address): Promise<void> {
  const res = await fetch(`${API_URL}/api/setup/${vaultAddress}/index`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? 'Failed to index vault on backend')
  }
}

export type SetupWalletClient = {
  account: Account
  chain: Chain
  sendTransaction: (args: {
    account: Account
    chain: Chain
    to: Address
    data?: Hex
    value?: bigint
  }) => Promise<Hex>
  writeContract: (args: {
    account: Account
    chain: Chain
    address: Address
    abi: readonly unknown[]
    functionName: string
    value?: bigint
    gas?: bigint
    args?: readonly unknown[]
  }) => Promise<Hex>
}

export type SetupPublicClient = {
  waitForTransactionReceipt: (args: { hash: Hex }) => Promise<{ status: string }>
}

export async function runWalletVaultSetup({
  deployment,
  walletClient,
  publicClient,
  onStep,
  onLog,
  onTransaction,
  epochCronStt = '0.5',
  fundEpochCron = true,
  triggerPipeline = true,
  customAgent = false,
}: {
  deployment: VaultDeployment
  walletClient: SetupWalletClient
  publicClient: SetupPublicClient
  onStep: (stepId: SetupStepId, status: SetupStep['status'], opts?: { txHash?: Hex; error?: string }) => void
  onLog: (entry: SetupLogEntry) => void
  onTransaction: (tx: SetupTransaction) => void
  epochCronStt?: string
  fundEpochCron?: boolean
  triggerPipeline?: boolean
  customAgent?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const vault = deployment.vaultAddress

  onStep('index', 'running')
  log(onLog, 'info', 'Notifying backend indexer…', 'index')
  try {
    await indexVaultOnBackend(vault)
    onStep('index', 'completed')
    log(onLog, 'success', `Vault indexed: ${vault}`, 'index')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStep('index', 'failed', { error: msg })
    log(onLog, 'error', `Index failed: ${msg}`, 'index')
    return { ok: false, error: msg }
  }

  const allTargets = buildVaultSubscriptionTargets({
    vault,
    mirrorReactor: deployment.mirrorReactor,
    stopReactor: deployment.stopReactor,
    drawdownGuard: deployment.drawdownGuard,
    epochCron: deployment.epochCron,
    performanceLedger: deployment.performanceLedger,
  })

  const targets: SubscriptionTarget[] = customAgent
    ? allTargets.filter((t) => t.name !== 'EpochCron')
    : allTargets

  for (const target of targets) {
    const stepId = STEP_BY_SUB[target.name]
    if (!stepId) continue

    onStep(stepId, 'running')
    log(onLog, 'info', `Confirm ${target.name} subscription in your wallet…`, stepId)

    try {
      const calldata = encodeReactivitySubscriptionCalldata(target)
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: walletClient.chain,
        to: REACTIVITY_PRECOMPILE,
        data: calldata,
      })

      onTransaction({ step: stepId, label: target.name, txHash: hash, status: 'pending' })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted')
      }

      onTransaction({ step: stepId, label: target.name, txHash: hash, status: 'confirmed' })
      onStep(stepId, 'completed', { txHash: hash })
      log(onLog, 'success', `${target.name} subscription confirmed`, stepId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStep(stepId, 'failed', { error: msg })
      log(onLog, 'error', `${target.name} failed: ${msg}`, stepId)
      return { ok: false, error: msg }
    }
  }

  if (customAgent) {
    onStep('epoch-sub', 'skipped')
    onStep('fund-cron', 'skipped')
    onStep('trigger-pipeline', 'skipped')
    log(onLog, 'success', 'Custom agent vault ready — connect your bot via signalvault-sdk', 'index')
    return { ok: true }
  }

  if (fundEpochCron) {
    onStep('fund-cron', 'running')
    log(onLog, 'info', `Confirm ${epochCronStt} STT transfer to EpochCron in your wallet…`, 'fund-cron')

    try {
      const value = parseEther(epochCronStt)
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: walletClient.chain,
        to: deployment.epochCron,
        value,
      })

      onTransaction({ step: 'fund-cron', label: 'Fund EpochCron', txHash: hash, status: 'pending' })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')

      onTransaction({ step: 'fund-cron', label: 'Fund EpochCron', txHash: hash, status: 'confirmed' })
      onStep('fund-cron', 'completed', { txHash: hash })
      log(onLog, 'success', `EpochCron funded with ${epochCronStt} STT`, 'fund-cron')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStep('fund-cron', 'failed', { error: msg })
      log(onLog, 'error', `EpochCron funding failed: ${msg}`, 'fund-cron')
      return { ok: false, error: msg }
    }
  } else {
    onStep('fund-cron', 'skipped')
  }

  if (triggerPipeline) {
    onStep('trigger-pipeline', 'running')
    const agentBudget = JSON_FETCH_COST + LLM_PARSE_COST + LLM_INFER_COST
    log(
      onLog,
      'info',
      `Confirm pipeline start (${agentBudget} STT) in your wallet…`,
      'trigger-pipeline',
    )

    try {
      const hash = await walletClient.writeContract({
        account: walletClient.account,
        chain: walletClient.chain,
        address: deployment.orchestrator,
        abi: agentOrchestratorAbi,
        functionName: 'startPipeline',
        value: parseEther(agentBudget.toString()),
        gas: BigInt(8_000_000),
      })

      onTransaction({ step: 'trigger-pipeline', label: 'Start Pipeline', txHash: hash, status: 'pending' })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')

      onTransaction({ step: 'trigger-pipeline', label: 'Start Pipeline', txHash: hash, status: 'confirmed' })
      onStep('trigger-pipeline', 'completed', { txHash: hash })
      log(onLog, 'success', 'First agent pipeline run started', 'trigger-pipeline')

      await indexVaultOnBackend(vault).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStep('trigger-pipeline', 'failed', { error: msg })
      log(onLog, 'error', `Pipeline trigger failed: ${msg}`, 'trigger-pipeline')
      return { ok: false, error: msg }
    }
  } else {
    onStep('trigger-pipeline', 'skipped')
  }

  log(onLog, 'success', 'Vault setup complete — vault is live on Somnia')
  return { ok: true }
}
