'use client'

import { use, useState, useEffect } from 'react'
import { type Address } from 'viem'
import { useReadContract } from 'wagmi'
import Link from 'next/link'
import { useVaultSignal } from '@/hooks/use-vault-signal'
import { useVaultPnl } from '@/hooks/use-vault-pnl'
import { useSignalHistory } from '@/hooks/use-signal-history'
import { useAgentPipeline } from '@/hooks/use-agent-pipeline'
import { useFollowerPosition } from '@/hooks/use-follower-positions'
import { vaultConfig, API_URL } from '@/lib/contracts'
import { VaultFactoryABI } from '@/abis/VaultFactory'
import { VAULT_FACTORY_ADDRESS } from '@/lib/constants'
import { isMockMode } from '@/lib/mock-mode'
import { getMockVault, getMockVaultMeta, getMockStats } from '@/lib/mock-data'
import { SignalDisplay } from '@/components/vault/signal-display'
import { SignalHistory } from '@/components/vault/signal-history'
import { PnlChart } from '@/components/vault/pnl-chart'
import { SubscribeForm } from '@/components/vault/subscribe-form'
import { VaultStatsPanel } from '@/components/vault/vault-stats'
import { PipelineStatus } from '@/components/vault/pipeline-status'
import { PipelineStatusPage } from '@/components/pipeline/pipeline-status'
import { Leaderboard } from '@/components/vault/leaderboard'
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
import type { VaultStats } from '@/types/vault'

export default function VaultDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const vaultAddress = address as Address
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

  const { data: strategyPrompt } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'strategyPrompt',
    query: { enabled: !isMockMode() },
  })

  const vaultName = isMockMode()
    ? (mockVault?.name ?? 'Mock Vault')
    : strategyPrompt
      ? (strategyPrompt as string).slice(0, 50) + '...'
      : 'Strategy Vault'

  useEffect(() => {
    setTitle(vaultName as string)
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

  const { data: followerCountData } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'followerCount',
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
          setStats({
            totalPnl: Number(d.totalPnl ?? 0) / 1e18,
            sharpeRatio: Number(d.sharpeApprox ?? 0) / 1000,
            winRate: Number(d.winRate ?? 0) / 10000,
            maxDrawdown: Number(d.maxDrawdownBps ?? 0) / 100,
            tradeCount: totalTrades,
            followerCount: followerCountData ? Number(followerCountData) : 0,
          })
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
      })
      .catch(() => {})
  }, [address, followerCountData])

  const resolvedStrategist = isMockMode() ? mockMeta?.strategist : strategist
  const resolvedOrchestrator = isMockMode() ? mockMeta?.orchestrator : orchestratorAddr

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
            <BreadcrumbPage className="max-w-[200px] truncate">{vaultName as string}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-3">
        <AddressBadge address={address} />
        {resolvedStrategist && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            by <AddressBadge address={resolvedStrategist as string} />
          </span>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {signalLoading && !displaySignal ? (
                <LoadingSpinner size="lg" className="py-12" />
              ) : displaySignal ? (
                <SignalDisplay signal={displaySignal} />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No active signal</p>
                  </CardContent>
                </Card>
              )}

              <PnlChart data={chartData} onRangeChange={setPnlRange} />
              <SignalHistory signals={signals} vaultAddress={address} />
            </div>

            <div className="space-y-6">
              <PipelineStatus currentStage={stage} isRunning={isRunning} />
              <VaultStatsPanel stats={stats} />
              <SubscribeForm
                vaultAddress={vaultAddress}
                isSubscribed={position?.active ?? false}
              />
            </div>
          </div>
        </TabsContent>

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
