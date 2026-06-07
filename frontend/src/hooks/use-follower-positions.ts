'use client'

import { useReadContract, useAccount } from 'wagmi'
import { type Address } from 'viem'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import { isMockMode } from '@/lib/mock-mode'
import type { FollowerConfig } from '@/types/vault'

export function useFollowerPosition(vaultAddress: Address) {
  const { address } = useAccount()

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'getFollowerConfig',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !isMockMode(),
      refetchInterval: 15_000,
    },
  })

  if (isMockMode()) {
    return {
      position: {
        follower: address ?? '0x000000000000000000000000000000000000dEaD',
        riskBps: 100,
        maxPositionUsd: BigInt(5000) * BigInt(1e18),
        maxSlippageBps: 100,
        stopLossBuffer: BigInt(500) * BigInt(1e16),
        active: true,
      } satisfies FollowerConfig,
      isLoading: false,
      error: undefined,
      refetch: async () => {},
    }
  }

  const position: FollowerConfig | undefined = data
    ? (() => {
        const d = data as { riskPct: number; maxPositionSize: bigint; maxSlippageBps: number; stopLossBuffer: bigint; active: boolean }
        return {
          follower: address!,
          riskBps: Number(d.riskPct),
          maxPositionUsd: d.maxPositionSize,
          maxSlippageBps: Number(d.maxSlippageBps),
          stopLossBuffer: d.stopLossBuffer,
          active: d.active,
        }
      })()
    : undefined

  return { position, isLoading, error, refetch }
}
