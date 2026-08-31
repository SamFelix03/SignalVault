'use client'

import { useState, useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, parseUnits, isAddress, type Hex, type Address } from 'viem'
import { TUSDC_DECIMALS } from '@/lib/constants'
import { Bot, Gauge, Percent, Wallet, Plug, Sparkles, Eye } from 'lucide-react'
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
import { cn } from '@/lib/utils'

type DeployPhase = 'form' | 'deploying' | 'resolving' | 'setup' | 'done'
type AgentType = 'native' | 'custom'
type VaultSourceMode = 'agent' | 'wallet'
type VaultInstrumentType = 'BINARY' | 'PERP'

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

function InstrumentChoice({
  value,
  onChange,
}: {
  value: VaultInstrumentType
  onChange: (v: VaultInstrumentType) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange('BINARY')}
        className={cn(
          'rounded-xl border p-4 text-left transition-colors',
          value === 'BINARY'
            ? 'border-accent bg-accent/10'
            : 'border-border/60 bg-secondary/20 hover:border-muted-foreground/30',
        )}
      >
        <span className="text-sm font-semibold">Event contracts</span>
        <p className="mt-2 text-xs text-muted-foreground">
          Timed UP/DOWN windows, tUSDC collateral, capped loss per trade.
        </p>
      </button>
      <button
        type="button"
        onClick={() => onChange('PERP')}
        className={cn(
          'rounded-xl border p-4 text-left transition-colors',
          value === 'PERP'
            ? 'border-accent bg-accent/10'
            : 'border-border/60 bg-secondary/20 hover:border-muted-foreground/30',
        )}
      >
        <span className="text-sm font-semibold">Perps</span>
        <p className="mt-2 text-xs text-muted-foreground">
          LONG/SHORT leverage on dreamDEX perps — USDso margin, liquidation risk.
        </p>
      </button>
    </div>
  )
}

function SourceModeChoice({
  value,
  onChange,
}: {
  value: VaultSourceMode
  onChange: (v: VaultSourceMode) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange('agent')}
        className={cn(
          'rounded-xl border p-4 text-left transition-colors',
          value === 'agent'
            ? 'border-accent bg-accent/10'
            : 'border-border/60 bg-secondary/20 hover:border-muted-foreground/30',
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">AI / custom agent</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Signals from an on-chain AI pipeline or your bot via signalvault-sdk.
        </p>
      </button>
      <button
        type="button"
        onClick={() => onChange('wallet')}
        className={cn(
          'rounded-xl border p-4 text-left transition-colors',
          value === 'wallet'
            ? 'border-accent bg-accent/10'
            : 'border-border/60 bg-secondary/20 hover:border-muted-foreground/30',
        )}
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Wallet-tracked</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mirror your real Event Contracts trades — followers copy your wallet fills.
        </p>
      </button>
    </div>
  )
}

function AgentTypeChoice({
  value,
  onChange,
}: {
  value: AgentType
  onChange: (v: AgentType) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange('native')}
        className={cn(
          'rounded-xl border p-4 text-left transition-colors',
          value === 'native'
            ? 'border-accent bg-accent/10'
            : 'border-border/60 bg-secondary/20 hover:border-muted-foreground/30',
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Use SignalVault agent</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          On-chain AI reads your prompt every epoch and publishes signals automatically.
        </p>
      </button>
      <button
        type="button"
        onClick={() => onChange('custom')}
        className={cn(
          'rounded-xl border p-4 text-left transition-colors',
          value === 'custom'
            ? 'border-accent bg-accent/10'
            : 'border-border/60 bg-secondary/20 hover:border-muted-foreground/30',
        )}
      >
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Connect my own agent</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Deploy a vault and publish signals from your bot via signalvault-sdk.
        </p>
      </button>
    </div>
  )
}

export function DeployForm() {
  const { address } = useAccount()
  const [sourceMode, setSourceMode] = useState<VaultSourceMode>('agent')
  const [instrumentType, setInstrumentType] = useState<VaultInstrumentType>('BINARY')
  const [agentType, setAgentType] = useState<AgentType>('native')
  const [sourceWallet, setSourceWallet] = useState('')
  const [vaultName, setVaultName] = useState('')
  const [strategyPrompt, setStrategyPrompt] = useState('')
  const [description, setDescription] = useState('')
  const [feeBps, setFeeBps] = useState(500)
  const [maxDrawdownBps, setMaxDrawdownBps] = useState(2000)
  const [signalPriceTusdc, setSignalPriceTusdc] = useState('0')
  const [deposit, setDeposit] = useState('1')

  const [phase, setPhase] = useState<DeployPhase>('form')
  const [deployment, setDeployment] = useState<ResolvedDeployment | undefined>()
  const [resolveError, setResolveError] = useState<string | null>(null)
  const setupStarted = useRef(false)

  const isWalletVault = sourceMode === 'wallet'
  const isCustom = !isWalletVault && agentType === 'custom'

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: deploySuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const fullStrategyPrompt = vaultName
    ? isWalletVault || isCustom
      ? `${vaultName}: ${description}`
      : `${vaultName}: ${strategyPrompt}`
    : isWalletVault || isCustom
      ? description
      : strategyPrompt

  function handleDeploy() {
    if (!vaultName) return
    if (isWalletVault) {
      if (!description || !isAddress(sourceWallet)) return
    } else if (isCustom) {
      if (!description) return
    } else if (!strategyPrompt) {
      return
    }

    setPhase('deploying')
    setResolveError(null)
    setupStarted.current = false

    const signalPriceWei = parseUnits(signalPriceTusdc || '0', TUSDC_DECIMALS)
    const instrument = instrumentType === 'PERP' ? 1 : 0

    if (isWalletVault) {
      writeContract({
        ...vaultFactoryConfig,
        functionName: 'deployWalletVault',
        args: [sourceWallet as Address, fullStrategyPrompt, feeBps, BigInt(maxDrawdownBps), signalPriceWei, instrument],
      })
    } else if (isCustom) {
      writeContract({
        ...vaultFactoryConfig,
        functionName: 'deployAgentVault',
        args: [fullStrategyPrompt, feeBps, BigInt(maxDrawdownBps), signalPriceWei, instrument],
      })
    } else {
      writeContract({
        ...vaultFactoryConfig,
        functionName: 'deployVault',
        args: [fullStrategyPrompt, feeBps, BigInt(maxDrawdownBps), signalPriceWei, instrument],
        value: parseEther(deposit),
      })
    }
  }

  async function retryResolve() {
    if (!txHash) return
    setResolveError(null)
    setPhase('resolving')
    try {
      const resolved = await resolveDeployTx(txHash as Hex)
      setDeployment(resolved)
      setPhase('setup')
    } catch (err) {
      console.error('[SignalVault] Deploy resolve failed', {
        txHash,
        error: err instanceof Error ? err.message : err,
        hint: 'Restart backend (npm run dev) if you recently updated vault-setup-service.ts',
      })
      setResolveError(err instanceof Error ? err.message : 'Post-deploy setup failed')
      setPhase('form')
    }
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
        console.error('[SignalVault] Deploy resolve failed', {
          txHash,
          error: err instanceof Error ? err.message : err,
          hint: 'Check backend logs for VaultSetupService — paste txHash + log block',
        })
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

  const progress = isWalletVault
    ? vaultName
      ? description && isAddress(sourceWallet)
        ? feeBps > 0
          ? 100
          : 75
        : 50
      : 0
    : isCustom
    ? vaultName
      ? description
        ? feeBps > 0
          ? 100
          : 75
        : 50
      : 0
    : vaultName
      ? strategyPrompt
        ? feeBps > 0
          ? deposit
            ? 100
            : 75
          : 50
        : 25
      : 0

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
          isCustomAgent={isCustom}
          isWalletVault={isWalletVault}
          isPerpVault={instrumentType === 'PERP'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DeployHero />

      {resolveError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p>{resolveError}</p>
          {txHash && deploySuccess && (
            <button
              type="button"
              onClick={() => void retryResolve()}
              className="mt-2 text-xs font-medium underline underline-offset-2 hover:no-underline"
            >
              Retry setup (tx already on-chain)
            </button>
          )}
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
                {isWalletVault
                  ? 'Track a wallet’s Event Contracts trades — no AI pipeline'
                  : isCustom
                    ? 'Deploy a vault for your bot — setup skips the AI pipeline'
                    : 'Define how your agent trades — setup runs automatically after deploy'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <FormSection
                step={1}
                title="Instrument"
                description="Event contracts (binary) or perps — fixed for the life of the vault"
                icon={Gauge}
              >
                <InstrumentChoice value={instrumentType} onChange={setInstrumentType} />
              </FormSection>

              <Separator />

              <FormSection
                step={2}
                title="Vault Source"
                description="AI agent signals or mirror a real trading wallet"
                icon={isWalletVault ? Eye : isCustom ? Plug : Sparkles}
              >
                <SourceModeChoice value={sourceMode} onChange={setSourceMode} />
              </FormSection>

              {!isWalletVault && (
                <>
                  <Separator />

                  <FormSection
                    step={2}
                    title="Agent Type"
                    description="Native on-chain AI or bring your own bot via the SDK"
                    icon={isCustom ? Plug : Sparkles}
                  >
                    <AgentTypeChoice value={agentType} onChange={setAgentType} />
                  </FormSection>
                </>
              )}

              <Separator />

              <FormSection
                step={isWalletVault ? 2 : 3}
                title="Vault Name"
                description="Shown on the leaderboard and prepended to your on-chain description"
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

              {isWalletVault ? (
                <>
                  <Separator />
                  <FormSection
                    step={3}
                    title="Source Wallet"
                    description="Event Contracts fills on this wallet become vault signals"
                    icon={Eye}
                  >
                    <Input
                      id="sourceWallet"
                      value={sourceWallet}
                      onChange={e => setSourceWallet(e.target.value)}
                      placeholder="0x… wallet to track"
                      className="font-mono border-border/80 bg-secondary/30 focus:bg-background"
                    />
                  </FormSection>
                  <Separator />
                  <FormSection
                    step={4}
                    title="Description"
                    description="Brief summary for followers — your wallet history is the proof"
                    icon={Bot}
                  >
                    <Input
                      id="description"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="e.g. BTC/ETH 15m event contracts — discretionary momentum"
                      className="border-border/80 bg-secondary/30 focus:bg-background"
                    />
                  </FormSection>
                </>
              ) : isCustom ? (
                <FormSection
                  step={4}
                  title="One-line Description"
                  description="Brief strategy summary for followers — your bot logic stays off-chain"
                  icon={Bot}
                >
                  <Input
                    id="description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. RSI momentum on ETH/USD — rebalances hourly"
                    className="border-border/80 bg-secondary/30 focus:bg-background"
                  />
                </FormSection>
              ) : (
                <FormSection
                  step={4}
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
              )}

              <Separator />

              <FormSection
                step={isWalletVault ? 5 : 5}
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

                  <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-4">
                    <Label htmlFor="signalPrice">Signal price (tUSDC per signal)</Label>
                    <Input
                      id="signalPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={signalPriceTusdc}
                      onChange={e => setSignalPriceTusdc(e.target.value)}
                      className="max-w-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Set to 0 for free signals. Followers pay in tUSDC — same token used for mirror trades.
                    </p>
                  </div>
                </div>
              </FormSection>

              {!isCustom && !isWalletVault && (
                <>
                  <Separator />
                  <FormSection
                    step={6}
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
                </>
              )}

              <Button
                onClick={handleDeploy}
                disabled={
                  !vaultName ||
                  (isWalletVault
                    ? !description || !isAddress(sourceWallet)
                    : isCustom
                      ? !description
                      : !strategyPrompt) ||
                  isPending ||
                  isConfirming ||
                  phase === 'deploying'
                }
                size="lg"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/10"
              >
                {isPending
                  ? 'Confirm in Wallet...'
                  : isConfirming
                    ? 'Deploying contracts...'
                    : isWalletVault
                      ? 'Deploy Wallet Vault'
                      : isCustom
                        ? 'Deploy Custom Agent Vault'
                        : 'Deploy Vault'}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                {isWalletVault
                  ? 'After deploy you\'ll confirm MirrorReactor + DrawdownGuard subscriptions. Signals mirror from your tracked wallet.'
                  : isCustom
                    ? 'After deploy you\'ll confirm ~2 subscription transactions, then copy the SDK snippet to connect your bot.'
                    : 'After deploy you\'ll confirm ~4 more transactions in MetaMask — subscriptions, epoch cron funding, and first pipeline run.'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-2 xl:sticky xl:top-24 xl:self-start">
          {isWalletVault ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Wallet-tracked vault</CardTitle>
                <CardDescription>
                  Followers mirror your real Event Contracts fills from{' '}
                  <code className="font-mono text-xs">{sourceWallet || 'your wallet'}</code>.
                  Make sure that wallet trades on Somnia Markets testnet.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : isCustom ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custom agent vault</CardTitle>
                <CardDescription>
                  After deploy, your <strong>vault address</strong> appears at the top of the setup screen — copy it into{' '}
                  <code className="font-mono text-xs">examples/rsi-agent/.env</code>. Install{' '}
                  <code className="font-mono text-xs">signalvault-sdk</code> and call{' '}
                  <code className="font-mono text-xs">vault.publish()</code> from your bot.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <PromptPreview name={vaultName} description={strategyPrompt} />
          )}
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
