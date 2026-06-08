'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type Hex, parseEther, parseUnits } from 'viem'
import { useWriteContract, useWaitForTransactionReceipt, useWalletClient, usePublicClient } from 'wagmi'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Rocket,
  XCircle,
  Zap,
  Radio,
  Coins,
  Bot,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { vaultConfig } from '@/lib/contracts'
import { EXPLORER_URL } from '@/lib/constants'
import {
  type ResolvedDeployment,
  type SetupStep,
  type SetupLogEntry,
  type SetupTransaction,
} from '@/hooks/use-vault-setup'
import {
  createInitialSetupSteps,
  runWalletVaultSetup,
  type SetupStepId,
  type SetupWalletClient,
  type SetupPublicClient,
} from '@/lib/vault-setup-runner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

const STEP_ICONS: Record<string, typeof Rocket> = {
  index: Zap,
  'mirror-sub': Radio,
  'stop-sub': Radio,
  'drawdown-sub': Radio,
  'epoch-sub': Radio,
  'fund-cron': Coins,
  'trigger-pipeline': Bot,
}

interface SetupWizardProps {
  deployment: ResolvedDeployment
  deployTxHash: Hex
  vaultName: string
}

export function SetupWizard({ deployment, deployTxHash, vaultName }: SetupWizardProps) {
  const router = useRouter()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [steps, setSteps] = useState<SetupStep[]>(createInitialSetupSteps)
  const [logs, setLogs] = useState<SetupLogEntry[]>([])
  const [transactions, setTransactions] = useState<SetupTransaction[]>([])
  const [subscribeDone, setSubscribeDone] = useState(false)
  const setupStarted = useRef(false)

  const { writeContract, data: subTxHash, isPending: subPending, error: subError } =
    useWriteContract()
  const { isLoading: subConfirming, isSuccess: subSuccess } = useWaitForTransactionReceipt({
    hash: subTxHash,
  })

  const vaultAddress = deployment.vaultAddress

  useEffect(() => {
    if (!walletClient || !publicClient || setupStarted.current) return
    const wc = walletClient
    const pc = publicClient
    setupStarted.current = true

    async function run() {
      setRunStatus('running')
      setLogs([{
        ts: new Date().toISOString(),
        level: 'info',
        message: 'Starting wallet-signed vault setup — confirm each transaction in MetaMask',
      }])

      const updateStep = (
        stepId: SetupStepId,
        status: SetupStep['status'],
        opts?: { txHash?: Hex; error?: string },
      ) => {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === stepId
              ? { ...s, status, txHash: opts?.txHash ?? s.txHash, error: opts?.error }
              : s,
          ),
        )
      }

      const result = await runWalletVaultSetup({
        deployment: {
          vaultAddress: deployment.vaultAddress,
          orchestrator: deployment.orchestrator,
          mirrorReactor: deployment.mirrorReactor,
          stopReactor: deployment.stopReactor,
          drawdownGuard: deployment.drawdownGuard,
          epochCron: deployment.epochCron,
          performanceLedger: deployment.performanceLedger,
        },
        walletClient: wc as unknown as SetupWalletClient,
        publicClient: pc as unknown as SetupPublicClient,
        onStep: updateStep,
        onLog: (entry) => setLogs((prev) => [...prev, entry]),
        onTransaction: (tx) => {
          setTransactions((prev) => {
            const idx = prev.findIndex((t) => t.step === tx.step)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = tx
              return next
            }
            return [...prev, tx]
          })
        },
      })

      if (result.ok) {
        setRunStatus('completed')
      } else {
        setRunStatus('failed')
        setSetupError(result.error ?? 'Setup failed')
      }
    }

    void run()
  }, [walletClient, publicClient, deployment])

  useEffect(() => {
    if (subSuccess) setSubscribeDone(true)
  }, [subSuccess])

  const deployStep: SetupStep = {
    id: 'deploy',
    label: 'Deploy Vault (8 contracts)',
    status: 'completed',
    txHash: deployTxHash,
  }

  const allSteps = [deployStep, ...steps]
  const completedCount = allSteps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped',
  ).length
  const progress = allSteps.length > 0 ? (completedCount / allSteps.length) * 100 : 5

  const allTransactions: SetupTransaction[] = [
    {
      step: 'deploy',
      label: 'VaultFactory.deployVault',
      txHash: deployTxHash,
      status: 'confirmed',
    },
    ...transactions,
  ]

  if (subTxHash) {
    allTransactions.push({
      step: 'subscribe',
      label: 'Subscribe to signals',
      txHash: subTxHash,
      status: subSuccess ? 'confirmed' : subConfirming || subPending ? 'pending' : 'failed',
    })
  }

  function handleSubscribe() {
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'subscribe',
      args: [{
        riskPct: 1000,
        maxPositionSize: parseEther('0.02'),
        maxSlippageBps: 300,
        stopLossBuffer: parseUnits('1', 18),
        active: true,
      }],
    })
  }

  const setupComplete = runStatus === 'completed'
  const setupFailed = runStatus === 'failed'
  const isRunning = runStatus === 'running'

  if (!walletClient) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <Wallet className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect wallet to continue vault setup</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-accent/20">
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-gradient-to-r from-accent to-chart-1 transition-all duration-700"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Vault Launch Sequence</CardTitle>
              <CardDescription className="mt-1">
                {vaultName} · signed by your wallet ·{' '}
                <span className="font-mono text-xs">{vaultAddress.slice(0, 10)}…</span>
              </CardDescription>
            </div>
            {isRunning && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">
                <Loader2 className="h-3 w-3 animate-spin" />
                Confirm in MetaMask
              </span>
            )}
            {setupComplete && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" />
                Live
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Progress value={progress} className="h-1.5 [&>div]:bg-accent" />

          <div className="space-y-2">
            {allSteps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
            <StepRow
              step={{
                id: 'subscribe',
                label: 'Subscribe as follower (optional)',
                status: subSuccess || subscribeDone
                  ? 'completed'
                  : subPending || subConfirming
                    ? 'running'
                    : 'pending',
                txHash: subTxHash,
                error: subError?.message,
              }}
              icon={UserPlus}
            />
          </div>
        </CardContent>
      </Card>

      {allTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Transactions ({allTransactions.length})</CardTitle>
            <CardDescription>Every on-chain action — all signed by your wallet</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {allTransactions.map((tx, i) => (
                <li
                  key={`${tx.txHash}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TxStatusIcon status={tx.status} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{tx.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {tx.txHash.slice(0, 14)}…{tx.txHash.slice(-6)}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`${EXPLORER_URL}/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 text-xs text-accent hover:text-accent/80"
                  >
                    Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Setup Log</CardTitle>
          </CardHeader>
          <CardContent>
            <SetupLogPanel logs={logs} />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {setupComplete && !subSuccess && !subscribeDone && (
          <Button
            onClick={handleSubscribe}
            disabled={subPending || subConfirming}
            variant="secondary"
            className="gap-2"
          >
            {subPending || subConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Subscribe to Your Vault
          </Button>
        )}

        {(setupComplete || setupFailed) && (
          <Button
            onClick={() => router.push(`/vault/${vaultAddress}`)}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Rocket className="h-4 w-4" />
            Open Vault Dashboard
          </Button>
        )}

        {setupComplete && (
          <Button variant="outline" asChild>
            <Link href={`/vault/${vaultAddress}?tab=pipeline`}>View Pipeline</Link>
          </Button>
        )}
      </div>

      {setupFailed && setupError && (
        <p className="text-sm text-destructive">{setupError}</p>
      )}
    </div>
  )
}

function StepRow({ step, icon: IconOverride }: { step: SetupStep; icon?: typeof Rocket }) {
  const Icon = IconOverride ?? STEP_ICONS[step.id] ?? Circle
  const isComplete = step.status === 'completed' || step.status === 'skipped'
  const isRunning = step.status === 'running'
  const isFailed = step.status === 'failed'

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        isRunning && 'border-accent/40 bg-accent/5',
        isComplete && 'border-success/30 bg-success/5',
        isFailed && 'border-destructive/30 bg-destructive/5',
        !isRunning && !isComplete && !isFailed && 'border-border/50 bg-secondary/10',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
          isComplete && 'border-success bg-success/20',
          isRunning && 'border-accent bg-accent/20',
          isFailed && 'border-destructive bg-destructive/20',
          !isComplete && !isRunning && !isFailed && 'border-border bg-secondary',
        )}
      >
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        ) : isFailed ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{step.label}</p>
        {step.error && <p className="text-xs text-destructive">{step.error}</p>}
      </div>

      {step.txHash && (
        <a
          href={`${EXPLORER_URL}/tx/${step.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

function TxStatusIcon({ status }: { status: SetupTransaction['status'] }) {
  if (status === 'confirmed') return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
  if (status === 'pending') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" />
}

function SetupLogPanel({ logs }: { logs: SetupLogEntry[] }) {
  return (
    <ul className="max-h-64 space-y-1.5 overflow-y-auto font-mono text-[11px]">
      {logs.map((entry, i) => (
        <li key={`${entry.ts}-${i}`} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground">
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
          <LogDot level={entry.level} />
          <span
            className={cn(
              entry.level === 'error' && 'text-destructive',
              entry.level === 'warn' && 'text-warning',
              entry.level === 'success' && 'text-success',
              entry.level === 'info' && 'text-foreground/90',
            )}
          >
            {entry.message}
          </span>
        </li>
      ))}
    </ul>
  )
}

function LogDot({ level }: { level: SetupLogEntry['level'] }) {
  const color =
    level === 'error'
      ? 'bg-destructive'
      : level === 'warn'
        ? 'bg-warning'
        : level === 'success'
          ? 'bg-success'
          : 'bg-muted-foreground'
  return <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', color)} />
}
