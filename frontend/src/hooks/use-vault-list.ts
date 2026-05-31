'use client'

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '@/lib/contracts'
import type { VaultInfo } from '@/types/vault'

export function useVaultList() {
  const [vaults, setVaults] = useState<VaultInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchVaults = useCallback(async () => {
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
