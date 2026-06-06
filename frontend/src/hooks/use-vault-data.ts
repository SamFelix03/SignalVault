'use client'

import { useState, useEffect, useCallback } from 'react'
import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { API_URL } from '@/lib/constants'
import { VaultFactoryABI } from '@/abis/VaultFactory'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import { VAULT_FACTORY_ADDRESS } from '@/lib/constants'
import type { VaultInfo, VaultStats } from '@/types/vault'

export interface VaultDeployment {
  vault: Address
  orchestrator: Address
  mirrorReactor: Address
  stopReactor: Address
  drawdownGuard: Address
  epochCron: Address
  performanceLedger: Address
  feeDistributor: Address
  strategist: Address
  deployedAt: bigint
}

export function useVaultData(vaultAddress: string) {
  const [vaults, setVaults] = useState<VaultInfo[]>([])
  const [stats, setStats] = useState<VaultStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFromBackend = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`${API_URL}/api/vaults/${vaultAddress}`)
      if (res.ok) {
        const data = await res.json()
        if (data.stats) setStats(data.stats)
        if (data.vaults) setVaults(data.vaults)
      }
    } catch {
      setError('Failed to fetch vault data from backend')
    } finally {
      setIsLoading(false)
    }
  }, [vaultAddress])

  useEffect(() => {
    fetchFromBackend()
    const interval = setInterval(fetchFromBackend, 30_000)
    return () => clearInterval(interval)
  }, [fetchFromBackend])

  return { vaults, stats, isLoading, error, refetch: fetchFromBackend }
}

export function useVaultList() {
  const [vaults, setVaults] = useState<VaultInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const { data: deploymentCount } = useReadContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: VaultFactoryABI,
    functionName: 'getDeploymentCount',
  })

  const fetchVaults = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`${API_URL}/api/vaults`)
      if (res.ok) {
        const data = await res.json()
        setVaults(Array.isArray(data) ? data : data.vaults ?? [])
      }
    } catch {
      // Backend may be unavailable
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVaults()
  }, [fetchVaults, deploymentCount])

  return { vaults, isLoading, refetch: fetchVaults, deploymentCount }
}

export function useVaultDeployment(vaultId: bigint | undefined) {
  const { data, isLoading } = useReadContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: VaultFactoryABI,
    functionName: 'getDeployment',
    args: vaultId !== undefined ? [vaultId] : undefined,
    query: { enabled: vaultId !== undefined },
  })

  const deployment = data as VaultDeployment | undefined

  return { deployment, isLoading }
}

export function useVaultFollowerCount(vaultAddress: Address) {
  const { data, isLoading } = useReadContract({
    address: vaultAddress,
    abi: StrategyVaultABI,
    functionName: 'followerCount',
    query: { refetchInterval: 30_000 },
  })

  return { followerCount: data as bigint | undefined, isLoading }
}
