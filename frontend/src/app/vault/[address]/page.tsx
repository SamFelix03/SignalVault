'use client'

import { use, useState, useEffect } from 'react'
import { type Address } from 'viem'
import { useReadContract, useAccount } from 'wagmi'
import Link from 'next/link'
import { Plug, Wallet } from 'lucide-react'
import { useVaultSignal } from '@/hooks/use-vault-signal'
import { useVaultPnl } from '@/hooks/use-vault-pnl'
import { useSignalHistory } from '@/hooks/use-signal-history'
import { useAgentPipeline } from '@/hooks/use-agent-pipeline'
import { useFollowerPosition } from '@/hooks/use-follower-positions'
import { vaultConfig, API_URL } from '@/lib/contracts'
import { ExternalSignalPublisherABI } from '@/abis/ExternalSignalPublisher'
import { isMockMode } from '@/lib/mock-mode'
import { getMockVault, getMockVaultMeta, getMockStats } from '@/lib/mock-data'
import { SignalDisplay } from '@/components/vault/signal-display'
import { SignalHistory } from '@/components/vault/signal-history'
import { PerpVaultOwnerSetup } from '@/components/vault/perp-vault-owner-setup'
import { PnlChart } from '@/components/vault/pnl-chart'
import { SubscribeForm } from '@/components/vault/subscribe-form'
import { VaultStatsPanel } from '@/components/vault/vault-stats'
import { PipelineStatus } from '@/components/vault/pipeline-status'
import { PipelineStatusPage } from '@/components/pipeline/pipeline-status'
import { Leaderboard } from '@/components/vault/leaderboard'
import { BinaryTradePanel } from '@/components/vault/wallet-trade-panel'
import { PerpTradePanel } from '@/components/vault/perp-trade-panel'
import { ConnectAgentPanel } from '@/components/deploy/connect-agent-panel'
import { AddressBadge } from '@/components/common/address-badge'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import { usePageHeader } from '@/components/layout/page-header-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { PublisherKind, VaultStats, VaultSourceType } from '@/types/vault'
import { parseVaultStrategyPrompt } from '@/lib/vault-strategy'
import { normalizeSourceType } from '@/lib/vault-source'

export default function VaultDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const vaultAddress = address as Address
  const { address: connectedAddress } = useAccount()
  const { setTitle } = usePageHeader()
  const mockMeta = isMockMode() ? getMockVaultMeta(address) : undefined
  const mockVault = isMockMode() ? getMockVault(address) : undefined
  const { signal, isLoading: signalLoading } = useVaultSignal(vaultAddress)
  const [pnlRange, setPnlRange] = useState<'1d' | '7d' | '30d'>('7d')
  const { chartData } = useVaultPnl(address, pnlRange)
  const { signals } = useSignalHistory(address)
  const displaySignal = signal ?? signals[0]
  const { stage, isRunning } = useAgentPipeline(address)
  const { position } = useFollowerPosition(vaultAddress)

  const [publisherKind, setPublisherKind] = useState<PublisherKind>('native')
  const [sourceType, setSourceType] = useState<VaultSourceType>('agent')
  const [sourceWallet, setSourceWallet] = useState<string | undefined>()
  const [showConnectPanel, setShowConnectPanel] = useState(false)

  const { data: instrumentTypeRaw } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'instrumentType',
    query: { enabled: !isMockMode() },
  })

  const instrumentType = Number(instrumentTypeRaw ?? 0) === 1 ? 'PERP' : 'BINARY'

  const { data: strategyPrompt } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'strategyPrompt',
    query: { enabled: !isMockMode() },
  })

  const parsedStrategy = isMockMode()
    ? {
        name: mockVault?.name ?? 'Mock Vault',
        prompt: mockVault?.strategyPrompt ?? '',
      }
    : parseVaultStrategyPrompt((strategyPrompt as string) ?? '')

  const vaultName = parsedStrategy.name
  const strategyText = parsedStrategy.prompt

  useEffect(() => {
    setTitle(vaultName)
    return () => setTitle(null)
  }, [vaultName, setTitle])

  const { data: strategist } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'strategist',
    query: { enabled: !isMockMode() },
  })

  const { data: orchestratorAddr } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'orchestrator',
    query: { enabled: !isMockMode() },
  })

  const { data: sourceTypeOnChain } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'sourceType',
    query: { enabled: !isMockMode() },
  })

  const { data: sourceWalletOnChain } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'sourceWallet',
    query: { enabled: !isMockMode() },
  })

  const { data: isCustomOnChain } = useReadContract({
    address: orchestratorAddr as Address,
    abi: ExternalSignalPublisherABI,
    functionName: 'isCustomPublisher',
    query: { enabled: !isMockMode() && !!orchestratorAddr },
  })

  const { data: followerCountData } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'followerCount',
    query: { enabled: !isMockMode() },
  })

  const { data: signalPriceOnChain } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'signalPrice',
    query: { enabled: !isMockMode() },
  })

  const [stats, setStats] = useState<VaultStats>(
    isMockMode()
      ? getMockStats(address)
      : { totalPnl: 0, sharpeRatio: 0, winRate: 0, maxDrawdown: 0, tradeCount: 0, followerCount: 0 }
  )

  const [performanceLedgerAddr, setPerformanceLedgerAddr] = useState<Address | undefined>(undefined)

  useEffect(() => {
    if (isMockMode()) {
      setStats(getMockStats(address))
      return
    }

    fetch(`${API_URL}/api/vaults/${address}/leaderboard`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          const totalTrades = Number(d.totalTrades ?? 0)
          const winCount = Number(d.winCount ?? 0)
          setStats(prev => ({
            ...prev,
            totalPnl: Number(d.totalPnl ?? 0) / 1e18,
            sharpeRatio: Number(d.sharpeApprox ?? 0) / 1000,
            winRate: Number(d.winRate ?? 0) / 10000,
            maxDrawdown: Number(d.maxDrawdownBps ?? 0) / 100,
            tradeCount: totalTrades,
            followerCount: followerCountData ? Number(followerCountData) : prev.followerCount,
          }))
          if (d.vault) {
            setPerformanceLedgerAddr(undefined)
          }
        }
      })
      .catch(() => {})

    fetch(`${API_URL}/api/vaults/${address}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const vault = d?.vault ?? d
        if (vault?.performanceLedger) {
          setPerformanceLedgerAddr(vault.performanceLedger as Address)
        }
        if (vault?.followerCount != null) {
          setStats(prev => ({ ...prev, followerCount: Number(vault.followerCount) }))
        }
        if (vault?.signalPrice != null) {
          setStats(prev => ({ ...prev, signalPrice: String(vault.signalPrice) }))
        }
        if (vault?.publisherKind) {
          setPublisherKind(vault.publisherKind as PublisherKind)
        }
        if (vault?.sourceType != null) {
          setSourceType(normalizeSourceType(vault.sourceType))
        }
        if (vault?.sourceWallet) {
          setSourceWallet(vault.sourceWallet as string)
        }
      })
      .catch(() => {})
  }, [address, followerCountData])

  useEffect(() => {
    if (isCustomOnChain === true) {
      setPublisherKind('custom')
    }
  }, [isCustomOnChain])

  useEffect(() => {
    if (sourceTypeOnChain != null) {
      setSourceType(normalizeSourceType(sourceTypeOnChain))
    }
  }, [sourceTypeOnChain])

  useEffect(() => {
    if (sourceWalletOnChain && sourceWalletOnChain !== '0x0000000000000000000000000000000000000000') {
      setSourceWallet(sourceWalletOnChain as string)
    }
  }, [sourceWalletOnChain])

  const isWalletVault = sourceType === 'wallet'
  const isCustomVault = !isWalletVault && (publisherKind === 'custom' || isCustomOnChain === true)
  const resolvedStrategist = isMockMode() ? mockMeta?.strategist : strategist
  const resolvedOrchestrator = isMockMode() ? mockMeta?.orchestrator : orchestratorAddr
  const { data: vaultOwner } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'owner',
  })

  const isOwner =
    connectedAddress &&
    ((resolvedStrategist &&
      connectedAddress.toLowerCase() === (resolvedStrategist as string).toLowerCase()) ||
      (vaultOwner &&
        connectedAddress.toLowerCase() === (vaultOwner as string).toLowerCase()))

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Leaderboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[200px] truncate">{vaultName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{vaultName}</h1>
          {isWalletVault ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-chart-1/10 px-2.5 py-1 text-xs font-medium text-chart-1">
              <Wallet className="h-3.5 w-3.5" />
              Wallet-tracked
            </span>
          ) : isCustomVault ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
              <Plug className="h-3.5 w-3.5" />
              Custom agent
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              AI Agent
            </span>
          )}
        </div>
        {strategyText ? (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{strategyText}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AddressBadge address={address} />
        {resolvedStrategist && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            by <AddressBadge address={resolvedStrategist as string} />
          </span>
        )}
        {isWalletVault && sourceWallet && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            tracked <AddressBadge address={sourceWallet} />
          </span>
        )}
        {isCustomVault && isOwner && resolvedOrchestrator && (
          <button
            type="button"
            onClick={() => setShowConnectPanel(v => !v)}
            className="text-xs text-accent hover:text-accent/80"
          >
            {showConnectPanel ? 'Hide SDK panel' : 'Connect your agent'}
          </button>
        )}
      </div>

      {isCustomVault && isOwner && showConnectPanel && resolvedOrchestrator && (
        <ConnectAgentPanel
          vaultAddress={vaultAddress}
          publisherAddress={resolvedOrchestrator as Address}
        />
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {!isCustomVault && !isWalletVault && <TabsTrigger value="pipeline">Pipeline</TabsTrigger>}
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {signalLoading && !displaySignal ? (
                <LoadingSpinner size="lg" className="py-12" />
              ) : displaySignal ? (
                <SignalDisplay signal={displaySignal} instrumentType={instrumentType} />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No active signal</p>
                  </CardContent>
                </Card>
              )}

              {isWalletVault && sourceWallet && isOwner && instrumentType === 'BINARY' && (
                <BinaryTradePanel
                  vaultAddress={vaultAddress}
                  sourceWallet={sourceWallet as Address}
                />
              )}

              {isWalletVault && sourceWallet && isOwner && instrumentType === 'PERP' && (
                <PerpTradePanel
                  vaultAddress={vaultAddress}
                  sourceWallet={sourceWallet as Address}
                />
              )}

              {isWalletVault && !isOwner && (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Wallet-tracked vault</p>
                    <p className="mt-2">
                      The strategist trades Event Contracts from{' '}
                      <span className="font-mono text-foreground">{sourceWallet?.slice(0, 10)}…</span>.
                      Fills are mirrored to followers automatically.
                    </p>
                  </CardContent>
                </Card>
              )}

              <PnlChart data={chartData} onRangeChange={setPnlRange} />
              <SignalHistory signals={signals} vaultAddress={address} instrumentType={instrumentType} />

              {isWalletVault && (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Claim resolved positions</p>
                    <p className="mt-2">
                      Unredeemed winnings from finalized markets will show here — redeem via Somnia Markets or an auto-claim watcher (coming soon).
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              {!isCustomVault && !isWalletVault && <PipelineStatus currentStage={stage} isRunning={isRunning} />}
              <VaultStatsPanel
                stats={{
                  ...stats,
                  signalPrice:
                    signalPriceOnChain != null
                      ? String(signalPriceOnChain)
                      : stats.signalPrice,
                }}
              />
              <SubscribeForm
                vaultAddress={vaultAddress}
                isSubscribed={position?.active ?? false}
              />
              {isOwner && instrumentType === 'PERP' && (
                <PerpVaultOwnerSetup vaultAddress={vaultAddress} />
              )}
            </div>
          </div>
        </TabsContent>

        {!isCustomVault && !isWalletVault && (
          <TabsContent value="pipeline" className="mt-6">
            {resolvedOrchestrator ? (
              <PipelineStatusPage
                vaultAddress={vaultAddress}
                orchestratorAddress={resolvedOrchestrator as Address}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Loading orchestrator address...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="leaderboard" className="mt-6">
          {performanceLedgerAddr ? (
            <Leaderboard performanceLedgerAddress={performanceLedgerAddr} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">Loading performance ledger...</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
