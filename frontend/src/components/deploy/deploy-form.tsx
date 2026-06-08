'use client'

import { useState, useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, type Hex } from 'viem'
import { Bot, Gauge, Percent, Wallet } from 'lucide-react'
import { vaultFactoryConfig } from '@/lib/contracts'
import { TxStatus } from '@/components/common/tx-status'
import { PromptPreview } from './prompt-preview'
import { SetupWizard } from './setup-wizard'
import { DeployHero } from './deploy-hero'
import {
  resolveDeployTx,
  type ResolvedDeployment,
} from '@/hooks/use-vault-setup'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

type DeployPhase = 'form' | 'deploying' | 'resolving' | 'setup' | 'done'

function FormSection({
  step,
  title,
  description,
  icon: Icon,
  children,
}: {
  step: number
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
          {step}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="pl-11">{children}</div>
    </div>
  )
}

export function DeployForm() {
  const { address } = useAccount()
  const [vaultName, setVaultName] = useState('')
  const [strategyPrompt, setStrategyPrompt] = useState('')
  const [feeBps, setFeeBps] = useState(500)
  const [maxDrawdownBps, setMaxDrawdownBps] = useState(2000)
  const [deposit, setDeposit] = useState('1')

  const [phase, setPhase] = useState<DeployPhase>('form')
  const [deployment, setDeployment] = useState<ResolvedDeployment | undefined>()
  const [resolveError, setResolveError] = useState<string | null>(null)
  const setupStarted = useRef(false)

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: deploySuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const fullStrategyPrompt = vaultName
    ? `${vaultName}: ${strategyPrompt}`
    : strategyPrompt

  function handleDeploy() {
    if (!strategyPrompt || !vaultName) return
    setPhase('deploying')
    setResolveError(null)
    setupStarted.current = false
    writeContract({
      ...vaultFactoryConfig,
      functionName: 'deployVault',
      args: [fullStrategyPrompt, feeBps, BigInt(maxDrawdownBps)],
      value: parseEther(deposit),
    })
  }

  useEffect(() => {
    if (!deploySuccess || !txHash || setupStarted.current) return
    setupStarted.current = true

    async function runPostDeploy() {
      setPhase('resolving')
      try {
        const resolved = await resolveDeployTx(txHash as Hex)
        setDeployment(resolved)
        setPhase('setup')
      } catch (err) {
        setResolveError(err instanceof Error ? err.message : 'Post-deploy setup failed')
        setPhase('form')
        setupStarted.current = false
      }
    }

    void runPostDeploy()
  }, [deploySuccess, txHash])

  const txState = isPending
    ? 'pending'
    : isConfirming
      ? 'confirming'
      : deploySuccess && phase === 'form'
        ? 'success'
        : writeError
          ? 'error'
          : 'idle'

  const progress = vaultName ? (strategyPrompt ? (feeBps > 0 ? (deposit ? 100 : 75) : 50) : 25) : 0

  function handleCloseTxStatus() {
    reset()
  }

  if (!address) {
    return (
      <>
        <DeployHero />
        <Card className="overflow-hidden">
          <div className="pointer-events-none h-1 bg-gradient-to-r from-accent via-chart-1 to-accent/50" />
          <CardContent className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
              <Wallet className="h-8 w-8 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Connect to Deploy</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Link your wallet to deploy an autonomous strategy vault on Somnia testnet.
            </p>
          </CardContent>
        </Card>
      </>
    )
  }

  if (phase === 'resolving') {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
          <Bot className="h-7 w-7 animate-pulse text-accent" />
        </div>
        <h3 className="text-lg font-semibold">Deploy confirmed — resolving vault…</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Reading VaultDeployed event and preparing Somnia reactivity subscriptions.
        </p>
      </div>
    )
  }

  if (phase === 'setup' && deployment && txHash) {
    return (
      <div className="space-y-6">
        <DeployHero />
        <SetupWizard
          deployment={deployment}
          deployTxHash={txHash as Hex}
          vaultName={vaultName}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DeployHero />

      {resolveError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {resolveError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card className="overflow-hidden">
            <div className="h-1 bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-accent to-chart-1 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <CardHeader>
              <CardTitle className="text-base">Vault Configuration</CardTitle>
              <CardDescription>
                Define how your agent trades — setup runs automatically after deploy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <FormSection
                step={1}
                title="Vault Name"
                description="Prepended to your strategy prompt on-chain"
                icon={Bot}
              >
                <Input
                  id="vaultName"
                  value={vaultName}
                  onChange={e => setVaultName(e.target.value)}
                  placeholder="e.g. ETH Momentum Alpha"
                  className="border-border/80 bg-secondary/30 focus:bg-background"
                />
              </FormSection>

              <Separator />

              <FormSection
                step={2}
                title="Strategy Prompt"
                description="The agent reads this every epoch to decide trades"
                icon={Bot}
              >
                <Textarea
                  id="strategy"
                  value={strategyPrompt}
                  onChange={e => setStrategyPrompt(e.target.value)}
                  rows={5}
                  placeholder="e.g. Momentum breakout on ETH/USDso. Max 20% drawdown. Exit if funding rate exceeds 0.1%. Reduce size when Fear & Greed below 30..."
                  className="resize-none border-border/80 bg-secondary/30 focus:bg-background"
                />
              </FormSection>

              <Separator />

              <FormSection
                step={3}
                title="Risk Parameters"
                description="Performance fee and drawdown guard thresholds"
                icon={Percent}
              >
                <div className="space-y-6">
                  <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/20 p-4">
                    <Label className="flex justify-between">
                      <span>Performance Fee</span>
                      <span className="font-mono text-accent">{(feeBps / 100).toFixed(1)}%</span>
                    </Label>
                    <Slider min={0} max={2000} step={50} value={[feeBps]} onValueChange={v => setFeeBps(v[0])} />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0%</span>
                      <span>20%</span>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/20 p-4">
                    <Label className="flex justify-between">
                      <span>Max Drawdown</span>
                      <span className="font-mono text-destructive">{(maxDrawdownBps / 100).toFixed(0)}%</span>
                    </Label>
                    <Slider min={500} max={5000} step={100} value={[maxDrawdownBps]} onValueChange={v => setMaxDrawdownBps(v[0])} />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>5%</span>
                      <span>50%</span>
                    </div>
                  </div>
                </div>
              </FormSection>

              <Separator />

              <FormSection
                step={4}
                title="Agent Funding"
                description="STT deposit — split between orchestrator and epoch cron"
                icon={Gauge}
              >
                <Input
                  id="deposit"
                  type="number"
                  value={deposit}
                  onChange={e => setDeposit(e.target.value)}
                  step="0.1"
                  min="0"
                  className="max-w-xs font-mono"
                />
              </FormSection>

              <Button
                onClick={handleDeploy}
                disabled={!vaultName || !strategyPrompt || isPending || isConfirming || phase === 'deploying'}
                size="lg"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/10"
              >
                {isPending ? 'Confirm in Wallet...' : isConfirming ? 'Deploying 8 Contracts...' : 'Deploy Vault'}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                After deploy you&apos;ll confirm ~6 more transactions in MetaMask — subscriptions,
                epoch cron funding, and first pipeline run.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-2 xl:sticky xl:top-24 xl:self-start">
          <PromptPreview name={vaultName} description={strategyPrompt} />
        </div>

        <TxStatus
          state={txState}
          hash={txHash}
          error={writeError?.message}
          onClose={handleCloseTxStatus}
        />
      </div>
    </div>
  )
}
