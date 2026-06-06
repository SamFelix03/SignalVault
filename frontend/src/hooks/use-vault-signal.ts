'use client'

import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { vaultConfig } from '@/lib/contracts'
import type { Signal } from '@/types/vault'

export function useVaultSignal(vaultAddress: Address) {
  const { data, isLoading, error, refetch } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'currentSignal',
    query: {
      refetchInterval: 10_000,
    },
  })

  const signal: Signal | undefined = data
    ? (() => {
        const d = data as unknown as {
          direction: number
          sizeBps: number
          stopPrice: bigint
          reasoningHash: string
          epoch: bigint
          timestamp: bigint
        }
        return {
          direction: Number(d.direction),
          sizeBps: Number(d.sizeBps),
          stopPrice: d.stopPrice,
          reasoningHash: d.reasoningHash,
          epoch: Number(d.epoch),
          timestamp: Number(d.timestamp),
        }
      })()
    : undefined

  return { signal, isLoading, error, refetch }
}
