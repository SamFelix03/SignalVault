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
import type { VaultSourceType } from '@/types/vault'
import { REACTIVITY_PRECOMPILE } from '@/lib/constants'
import { API_URL } from '@/lib/contracts'
import { fetchPerpRouterStatus } from '@/lib/mirror-wallet'
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
  | 'perp-router'
  | 'mirror-sub'
  | 'stop-sub'
  | 'drawdown-sub'
  | 'epoch-sub'
  | 'fund-cron'
  | 'trigger-pipeline'

const STEP_DEFS: { id: SetupStepId; label: string }[] = [
  { id: 'index', label: 'Index vault metadata' },
  { id: 'perp-router', label: 'Enable perp mirror pulls' },
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

export function createInitialSetupSteps(
  customAgent = false,
  walletVault = false,
  isPerpVault = false,
): SetupStep[] {
  return STEP_DEFS.map((d) => {
    if (d.id === 'stop-sub') {
      return { id: d.id, label: d.label, status: 'skipped' as const }
    }
    if (d.id === 'perp-router' && !isPerpVault) {
      return { id: d.id, label: d.label, status: 'skipped' as const }
    }
    if ((customAgent || walletVault) && (d.id === 'epoch-sub' || d.id === 'fund-cron' || d.id === 'trigger-pipeline')) {
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
  deployContract?: (args: {
    account: Account
    chain: Chain
    abi: readonly unknown[]
    bytecode: Hex
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
  sourceType = 'agent' as VaultSourceType,
  isPerpVault = false,
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
  sourceType?: VaultSourceType
  isPerpVault?: boolean
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

  if (isPerpVault) {
    onStep('perp-router', 'running')
    log(onLog, 'info', 'Checking perp execution router…', 'perp-router')
    try {
      const status = await fetchPerpRouterStatus(vault)
      if (!status.needsUpgrade) {
        onStep('perp-router', 'skipped')
        log(onLog, 'success', 'Perp router already supports auto-pull mirrors', 'perp-router')
      } else {
        if (!status.deployBytecode || !walletClient.deployContract) {
          throw new Error('Perp router upgrade unavailable — restart backend after contracts build')
        }
        log(onLog, 'info', 'Deploying updated PerpRouter — confirm in wallet…', 'perp-router')
        const deployHash = await walletClient.deployContract({
          account: walletClient.account,
          chain: walletClient.chain,
          abi: [{ type: 'constructor', inputs: [{ type: 'address' }, { type: 'address' }], stateMutability: 'nonpayable' }],
          bytecode: status.deployBytecode as Hex,
          args: [deployment.mirrorReactor, status.marginBank],
        })
        onTransaction({ step: 'perp-router', label: 'Deploy PerpRouter', txHash: deployHash, status: 'pending' })
        const deployReceipt = (await publicClient.waitForTransactionReceipt({ hash: deployHash })) as {
          status: string
          contractAddress?: Address
        }
        if (deployReceipt.status !== 'success') throw new Error('PerpRouter deploy reverted')
        const newRouter = deployReceipt.contractAddress
        if (!newRouter) throw new Error('PerpRouter deploy missing address')

        log(onLog, 'info', 'Pointing vault at new PerpRouter…', 'perp-router')
        const setHash = await walletClient.writeContract({
          account: walletClient.account,
          chain: walletClient.chain,
          address: vault,
          abi: [{ type: 'function', name: 'setEventRouter', inputs: [{ type: 'address' }], outputs: [], stateMutability: 'nonpayable' }],
          functionName: 'setEventRouter',
          args: [newRouter],
        })
        onTransaction({ step: 'perp-router', label: 'Update event router', txHash: setHash, status: 'pending' })
        const setReceipt = await publicClient.waitForTransactionReceipt({ hash: setHash })
        if (setReceipt.status !== 'success') throw new Error('setEventRouter reverted')

        onTransaction({ step: 'perp-router', label: 'Perp mirror pulls', txHash: setHash, status: 'confirmed' })
        onStep('perp-router', 'completed', { txHash: setHash })
        log(onLog, 'success', `Perp auto-pull router live at ${newRouter}`, 'perp-router')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStep('perp-router', 'failed', { error: msg })
      log(onLog, 'error', `Perp router setup failed: ${msg}`, 'perp-router')
      return { ok: false, error: msg }
    }
  } else {
    onStep('perp-router', 'skipped')
  }

  const allTargets = buildVaultSubscriptionTargets(
    {
      vault,
      mirrorReactor: deployment.mirrorReactor,
      stopReactor: deployment.stopReactor,
      drawdownGuard: deployment.drawdownGuard,
      epochCron: deployment.epochCron,
      performanceLedger: deployment.performanceLedger,
    },
    { sourceType },
  )

  const targets: SubscriptionTarget[] =
    customAgent || sourceType === 'wallet'
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

  if (customAgent || sourceType === 'wallet') {
    onStep('epoch-sub', 'skipped')
    onStep('fund-cron', 'skipped')
    onStep('trigger-pipeline', 'skipped')
    log(
      onLog,
      'success',
      sourceType === 'wallet'
        ? 'Wallet-tracked vault ready — signals mirror from your trading wallet'
        : 'Custom agent vault ready — connect your bot via signalvault-sdk',
      'index',
    )
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
