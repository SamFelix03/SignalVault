'use client'

import { useState, type ComponentType, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { Bot, Gauge, Percent, Wallet, Sparkles } from 'lucide-react'
import { vaultFactoryConfig } from '@/lib/contracts'
import { TxStatus } from '@/components/common/tx-status'
import { PromptPreview } from './prompt-preview'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

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
  const router = useRouter()
  const { address } = useAccount()
  const [strategyPrompt, setStrategyPrompt] = useState('')
  const [feeBps, setFeeBps] = useState(500)
  const [maxDrawdownBps, setMaxDrawdownBps] = useState(2000)
  const [deposit, setDeposit] = useState('1')

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  function handleDeploy() {
    if (!strategyPrompt) return
    writeContract({
      ...vaultFactoryConfig,
      functionName: 'deployVault',
      args: [strategyPrompt, feeBps, BigInt(maxDrawdownBps)],
      value: parseEther(deposit),
    })
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'
  const progress = strategyPrompt ? (feeBps > 0 ? (deposit ? 100 : 66) : 33) : 0

  function handleClose() {
    reset()
    if (isSuccess) {
      router.push('/')
    }
  }

  if (!address) {
    return (
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
    )
  }

  return (
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
            <CardDescription>Define how your agent trades and manages risk</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <FormSection
              step={1}
              title="Strategy Prompt"
              description="The agent reads this every epoch to decide trades"
              icon={Bot}
            >
              <Textarea
                id="strategy"
                value={strategyPrompt}
                onChange={e => setStrategyPrompt(e.target.value)}
                rows={6}
                placeholder="e.g. Momentum breakout on BTC/USDC. Max 20% drawdown. Exit if funding rate exceeds 0.1%. Reduce size when Fear & Greed below 30..."
                className="resize-none border-border/80 bg-secondary/30 focus:bg-background"
              />
            </FormSection>

            <Separator />

            <FormSection
              step={2}
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
              step={3}
              title="Agent Funding"
              description="STT deposit for the orchestrator pipeline"
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
              disabled={!strategyPrompt || isPending || isConfirming}
              size="lg"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/10"
            >
              <Sparkles className="h-4 w-4" />
              {isPending ? 'Confirm in Wallet...' : isConfirming ? 'Deploying 8 Contracts...' : 'Deploy Vault'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:col-span-2 xl:sticky xl:top-24 xl:self-start">
        <PromptPreview name={strategyPrompt.slice(0, 50)} description={strategyPrompt} />
      </div>

      <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
    </div>
  )
}
