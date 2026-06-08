'use client'

import { useState, useEffect } from 'react'
import { type Address } from 'viem'
import { useReadContract } from 'wagmi'
import { vaultConfig } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { getMockSignals } from '@/lib/mock-data'
import type { Signal } from '@/types/vault'
import { sanitizeReasoning } from '@/lib/sanitize-pipeline-text'

export function useSignalHistory(vaultAddress: string) {
  const [signals, setSignals] = useState<Signal[]>(
    isMockMode() ? getMockSignals(vaultAddress) : []
  )
  const [isLoading, setIsLoading] = useState(!isMockMode())
  const [error, setError] = useState<Error | null>(null)

  const { data: historyLength } = useReadContract({
    ...vaultConfig(vaultAddress as Address),
    functionName: 'signalHistoryLength',
    query: {
      enabled: !isMockMode(),
      refetchInterval: 15_000,
    },
  })

  const limit = Math.min(Number(historyLength ?? 0), 20)
  const offset = Math.max(Number(historyLength ?? 0) - limit, 0)

  const { data: historyData } = useReadContract({
    ...vaultConfig(vaultAddress as Address),
    functionName: 'getSignalHistory',
    args: [BigInt(offset), BigInt(limit)],
    query: {
      enabled: !isMockMode() && limit > 0,
      refetchInterval: 15_000,
    },
  })

  useEffect(() => {
    if (isMockMode()) {
      setSignals(getMockSignals(vaultAddress))
      setIsLoading(false)
      return
    }

    if (historyData) {
      try {
        const raw = historyData as readonly {
          direction: number
          sizeBps: number
          stopPrice: bigint
          epoch: bigint
          reasoningHash: `0x${string}`
          reasoningSummary: string
        }[]

        const toSignedInt8 = (value: unknown) => {
          const n = Number(value ?? 0)
          return n > 127 ? n - 256 : n
        }

        const mapped: Signal[] = raw.map(s => ({
          direction: toSignedInt8(s.direction),
          sizeBps: Number(s.sizeBps),
          stopPrice: s.stopPrice,
          epoch: Number(s.epoch),
          reasoningHash: s.reasoningHash,
          reasoning: sanitizeReasoning(s.reasoningSummary),
          timestamp: 0,
        })).reverse()

        setSignals(mapped)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to parse signal history'))
      }
    }
    setIsLoading(false)
  }, [historyData, vaultAddress])

  return { signals, isLoading, error }
}
