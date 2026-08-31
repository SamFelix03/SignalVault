'use client'

import { useEffect, useState } from 'react'
import { type Address } from 'viem'
import { fetchMirrorWallet } from '@/lib/mirror-wallet'

export function useMirrorWallet(vault: Address | undefined, follower: Address | undefined) {
  const [mirrorWallet, setMirrorWallet] = useState<Address | undefined>()
  const [perpRouter, setPerpRouter] = useState<Address | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vault || !follower) {
      setMirrorWallet(undefined)
      setPerpRouter(undefined)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchMirrorWallet(vault, follower)
      .then((result) => {
        if (cancelled) return
        setMirrorWallet(result.mirrorWallet)
        setPerpRouter(result.perpRouter)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to resolve mirror wallet')
        setMirrorWallet(undefined)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [vault, follower])

  return { mirrorWallet, perpRouter, error, loading }
}
