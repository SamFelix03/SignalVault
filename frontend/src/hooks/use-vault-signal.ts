'use client'

import { useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { vaultConfig, API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { getMockVault } from '@/lib/mock-data'
import type { Signal } from '@/types/vault'
import { sanitizeReasoning } from '@/lib/sanitize-pipeline-text'

function toSignedInt8(value: unknown): number {
  const n = Number(value ?? 0)
  return n > 127 ? n - 256 : n
}

function parseCurrentSignal(data: unknown): Signal | undefined {
  if (data == null) return undefined

  let direction: number
  let sizeBps: number
  let marketId: string
  let limitPrice: bigint
  let epoch: number
  let reasoningHash: string
  let reasoningSummary: string

  if (Array.isArray(data)) {
    direction = toSignedInt8(data[0])
    sizeBps = Number(data[1] ?? 0)
    marketId = String(data[2] ?? '0x')
    limitPrice = BigInt(String(data[3] ?? 0))
    epoch = Number(data[4] ?? 0)
    reasoningHash = String(data[5] ?? '0x')
    reasoningSummary = String(data[6] ?? '')
  } else {
    const d = data as Record<string, unknown>
    direction = toSignedInt8(d.direction ?? 0)
    sizeBps = Number(d.sizeBps ?? 0)
    marketId = String(d.marketId ?? '0x')
    limitPrice = BigInt(String(d.limitPrice ?? d.stopPrice ?? 0))
    epoch = Number(d.epoch ?? 0)
    reasoningHash = String(d.reasoningHash ?? '0x')
    reasoningSummary = String(d.reasoningSummary ?? '')
  }

  if (direction === 0 && sizeBps === 0) return undefined

  return {
    direction,
    sizeBps,
    marketId,
    limitPrice,
    epoch,
    reasoningHash,
    reasoning: sanitizeReasoning(reasoningSummary),
    timestamp: 0,
  }
}

export function useVaultSignal(vaultAddress: Address) {
  const mockVault = isMockMode() ? getMockVault(vaultAddress) : undefined

  const { data, isLoading, error, refetch } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'getCurrentSignal',
    query: {
      enabled: !isMockMode(),
      refetchInterval: 10_000,
    },
  })

  useEffect(() => {
    if (isMockMode()) return
    const source = new EventSource(`${API_URL}/api/events`)
    source.onmessage = () => {
      void refetch()
    }
    return () => source.close()
  }, [refetch])

  if (isMockMode()) {
    return {
      signal: mockVault?.currentSignal,
      isLoading: false,
      error: mockVault ? undefined : new Error('Mock vault not found'),
      refetch: async () => {},
    }
  }

  const signal = parseCurrentSignal(data)

  return { signal, isLoading, error, refetch }
}
