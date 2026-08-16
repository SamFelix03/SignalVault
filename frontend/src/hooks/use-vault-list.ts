'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import { useVaultEvents } from '@/hooks/use-vault-events'
import { isMockMode } from '@/lib/mock-mode'
import { mockVaults } from '@/lib/mock-data'
import type { VaultInfo, Signal } from '@/types/vault'
import { sanitizeReasoning } from '@/lib/sanitize-pipeline-text'
import { parseVaultStrategyPrompt } from '@/lib/vault-strategy'

interface BackendVault {
  address: string
  strategist: string
  strategyPrompt: string
  performanceFeeBps: number
  followerCount: number
  deployedAt: string
  orchestrator: string
  performanceLedger: string
  publisherKind?: 'native' | 'custom'
  currentSignal: {
    direction: number
    sizeBps: number
    stopPrice: string
    epoch: string
    reasoningHash: string
    reasoningSummary: string
  }
}

function mapVault(v: BackendVault): VaultInfo {
  const sig = v.currentSignal
  const signal: Signal = {
    direction: Number(sig?.direction ?? 0),
    sizeBps: Number(sig?.sizeBps ?? 0),
    stopPrice: BigInt(sig?.stopPrice ?? '0'),
    epoch: Number(sig?.epoch ?? 0),
    reasoningHash: sig?.reasoningHash ?? '',
    reasoning: sanitizeReasoning(sig?.reasoningSummary),
    timestamp: 0,
  }

  const { name, prompt } = parseVaultStrategyPrompt(v.strategyPrompt ?? '')

  return {
    address: v.address,
    name,
    strategist: v.strategist,
    strategyPrompt: prompt,
    performanceFeeBps: v.performanceFeeBps,
    currentSignal: signal,
    stats: { totalPnl: 0, sharpeRatio: 0, winRate: 0, maxDrawdown: 0, tradeCount: 0, followerCount: v.followerCount ?? 0 },
    followerCount: v.followerCount ?? 0,
    createdAt: Number(v.deployedAt ?? 0),
    publisherKind: v.publisherKind ?? 'native',
  }
}

export function useVaultList() {
  const [vaults, setVaults] = useState<VaultInfo[]>(isMockMode() ? mockVaults : [])
  const [isLoading, setIsLoading] = useState(!isMockMode())
  const [error, setError] = useState<Error | null>(null)

  const enrichStats = useCallback(async (list: VaultInfo[]): Promise<VaultInfo[]> => {
    return Promise.all(
      list.map(async (vault) => {
        try {
          const res = await fetch(`${API_URL}/api/vaults/${vault.address}/leaderboard`)
          if (!res.ok) return vault
          const stats = await res.json()
          return {
            ...vault,
            stats: {
              totalPnl: Number(stats.totalPnl ?? 0) / 1e18,
              sharpeRatio: Number(stats.sharpeApprox ?? 0) / 1000,
              winRate: Number(stats.winRate ?? 0) / 100,
              maxDrawdown: Number(stats.maxDrawdownBps ?? 0) / 100,
              tradeCount: Number(stats.totalTrades ?? 0),
              followerCount: vault.followerCount ?? 0,
            },
          }
        } catch {
          return vault
        }
      })
    )
  }, [])

  const fetchVaults = useCallback(async () => {
    if (isMockMode()) {
      setVaults(mockVaults)
      setIsLoading(false)
      setError(null)
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/vaults`)
      if (!res.ok) throw new Error(`Failed to fetch vaults: ${res.statusText}`)
      const data = await res.json()
      const raw: BackendVault[] = data.vaults ?? data ?? []
      const mapped = raw.map(mapVault)
      setVaults(await enrichStats(mapped))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [enrichStats])

  useVaultEvents(fetchVaults)

  useEffect(() => {
    fetchVaults()
    const interval = setInterval(fetchVaults, 30_000)
    return () => clearInterval(interval)
  }, [fetchVaults])

  return { vaults, isLoading, error, refetch: fetchVaults }
}
