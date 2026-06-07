'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import { isMockMode } from '@/lib/mock-mode'
import { mockVaults } from '@/lib/mock-data'
import type { VaultInfo } from '@/types/vault'

export function useVaultList() {
  const [vaults, setVaults] = useState<VaultInfo[]>(isMockMode() ? mockVaults : [])
  const [isLoading, setIsLoading] = useState(!isMockMode())
  const [error, setError] = useState<Error | null>(null)

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
      setVaults(data.vaults ?? data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVaults()
    const interval = setInterval(fetchVaults, 15_000)
    return () => clearInterval(interval)
  }, [fetchVaults])

  return { vaults, isLoading, error, refetch: fetchVaults }
}
