'use client'

import { useReadContract, useAccount } from 'wagmi'
import { type Address } from 'viem'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import type { FollowerConfig } from '@/types/vault'

export function useFollowerPosition(vaultAddress: Address) {
  const { address } = useAccount()

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'getFollowerConfig',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  })

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
