'use client'

import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { vaultConfig } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { getMockVault } from '@/lib/mock-data'
import type { Signal } from '@/types/vault'

export function useVaultSignal(vaultAddress: Address) {
  const mockVault = isMockMode() ? getMockVault(vaultAddress) : undefined

  const { data, isLoading, error, refetch } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'currentSignal',
    query: {
      enabled: !isMockMode(),
      refetchInterval: 10_000,
    },
  })

  if (isMockMode()) {
    return {
      signal: mockVault?.currentSignal,
      isLoading: false,
      error: mockVault ? undefined : new Error('Mock vault not found'),
      refetch: async () => {},
    }
  }

  let signal: Signal | undefined = undefined
  if (data) {
    const d = data as Record<string, unknown>
    const direction = Number(d.direction ?? (d as any)[0] ?? 0)
    const sizeBps = Number(d.sizeBps ?? (d as any)[1] ?? 0)
    const hasSignal = direction !== 0 || sizeBps !== 0
    if (hasSignal) {
      signal = {
        direction,
        sizeBps,
        stopPrice: BigInt(String(d.stopPrice ?? (d as any)[2] ?? 0)),
        epoch: Number(d.epoch ?? (d as any)[3] ?? 0),
        reasoningHash: String(d.reasoningHash ?? (d as any)[4] ?? '0x'),
        reasoning: String(d.reasoningSummary ?? (d as any)[5] ?? '') || undefined,
        timestamp: 0,
      }
    }
  }

  return { signal, isLoading, error, refetch }
}
