'use client'

import { use, useState, useEffect } from 'react'
import { type Address } from 'viem'
import { useReadContract } from 'wagmi'
import { useVaultSignal } from '@/hooks/use-vault-signal'
import { useVaultPnl } from '@/hooks/use-vault-pnl'
import { useSignalHistory } from '@/hooks/use-signal-history'
import { useAgentPipeline } from '@/hooks/use-agent-pipeline'
import { useFollowerPosition } from '@/hooks/use-follower-positions'
import { vaultConfig, API_URL } from '@/lib/contracts'
import { VaultFactoryABI } from '@/abis/VaultFactory'
import { VAULT_FACTORY_ADDRESS } from '@/lib/constants'
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
import { cn } from '@/lib/utils'
import type { VaultStats } from '@/types/vault'

type Tab = 'overview' | 'pipeline' | 'leaderboard'

export default function VaultDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const vaultAddress = address as Address
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const { signal, isLoading: signalLoading } = useVaultSignal(vaultAddress)
  const [pnlRange, setPnlRange] = useState<'1d' | '7d' | '30d'>('7d')
  const { chartData } = useVaultPnl(address, pnlRange)
  const { signals } = useSignalHistory(address)
  const { stage, isRunning } = useAgentPipeline(address)
  const { position } = useFollowerPosition(vaultAddress)

  const { data: strategyPrompt } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'strategyPrompt',
  })

  const vaultName = strategyPrompt ? (strategyPrompt as string).slice(0, 50) + '...' : 'Strategy Vault'

  const { data: strategist } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'strategist',
  })

  const { data: orchestratorAddr } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'orchestrator',
  })

  const { data: deploymentCount } = useReadContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: VaultFactoryABI,
    functionName: 'getDeploymentCount',
  })

  const [deploymentId, setDeploymentId] = useState<bigint | undefined>(undefined)
  const [performanceLedgerAddr, setPerformanceLedgerAddr] = useState<Address | undefined>(undefined)

  useEffect(() => {
    async function findDeployment() {
      if (!deploymentCount) return
      const count = Number(deploymentCount as bigint)
      for (let i = 0; i < count; i++) {
        setDeploymentId(BigInt(i))
        break
      }
    }
    findDeployment()
  }, [deploymentCount])

  const { data: deploymentData } = useReadContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: VaultFactoryABI,
    functionName: 'getDeployment',
    args: deploymentId !== undefined ? [deploymentId] : undefined,
    query: { enabled: deploymentId !== undefined },
  })

  useEffect(() => {
    if (!deploymentData) return
    const d = deploymentData as { vault: Address; performanceLedger: Address; orchestrator: Address }
    if (d.vault.toLowerCase() === vaultAddress.toLowerCase()) {
      setPerformanceLedgerAddr(d.performanceLedger)
    }
  }, [deploymentData, vaultAddress])

  const [stats, setStats] = useState<VaultStats>({
    totalPnl: 0, sharpeRatio: 0, winRate: 0, maxDrawdown: 0, tradeCount: 0, followerCount: 0,
  })

  useEffect(() => {
    fetch(`${API_URL}/api/vaults/${address}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d) })
      .catch(() => {})
  }, [address])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'leaderboard', label: 'Leaderboard' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          {(vaultName as string) || 'Loading Vault...'}
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <AddressBadge address={address} />
          {strategist && (
            <span className="text-xs text-zinc-500">
              by <AddressBadge address={strategist as string} />
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <PipelineStatus currentStage={stage} isRunning={isRunning} />

          {signalLoading ? (
            <LoadingSpinner size="lg" className="py-12" />
          ) : signal ? (
            <SignalDisplay signal={signal} />
          ) : (
            <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-8 text-center backdrop-blur-sm">
              <p className="text-zinc-500">No active signal</p>
            </div>
          )}

          <VaultStatsPanel stats={stats} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PnlChart data={chartData} onRangeChange={setPnlRange} />
            </div>
            <SubscribeForm
              vaultAddress={vaultAddress}
              isSubscribed={position?.active ?? false}
            />
          </div>

          <SignalHistory signals={signals} vaultAddress={address} />
        </>
      )}

      {activeTab === 'pipeline' && (
        orchestratorAddr ? (
          <PipelineStatusPage orchestratorAddress={orchestratorAddr as Address} />
        ) : (
          <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-8 text-center backdrop-blur-sm">
            <p className="text-zinc-500">Loading orchestrator address...</p>
          </div>
        )
      )}

      {activeTab === 'leaderboard' && (
        performanceLedgerAddr ? (
          <Leaderboard performanceLedgerAddress={performanceLedgerAddr} />
        ) : (
          <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-8 text-center backdrop-blur-sm">
            <p className="text-zinc-500">Loading performance ledger...</p>
          </div>
        )
      )}
    </div>
  )
}
