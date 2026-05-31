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
import { SignalDisplay } from '@/components/vault/signal-display'
import { SignalHistory } from '@/components/vault/signal-history'
import { PnlChart } from '@/components/vault/pnl-chart'
import { SubscribeForm } from '@/components/vault/subscribe-form'
import { VaultStatsPanel } from '@/components/vault/vault-stats'
import { PipelineStatus } from '@/components/vault/pipeline-status'
import { AddressBadge } from '@/components/common/address-badge'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import type { VaultStats } from '@/types/vault'

export default function VaultDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const vaultAddress = address as Address
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

  const [stats, setStats] = useState<VaultStats>({
    totalPnl: 0, sharpeRatio: 0, winRate: 0, maxDrawdown: 0, tradeCount: 0, followerCount: 0,
  })

  useEffect(() => {
    fetch(`${API_URL}/api/vaults/${address}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d) })
      .catch(() => {})
  }, [address])

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
    </div>
  )
}
