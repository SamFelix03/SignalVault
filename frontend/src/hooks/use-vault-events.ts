'use client'

import { useEffect } from 'react'
import { API_URL } from '@/lib/contracts'

export function useVaultEvents(onUpdate: () => void) {
  useEffect(() => {
    const source = new EventSource(`${API_URL}/api/events`)
    source.onmessage = () => onUpdate()
    return () => source.close()
  }, [onUpdate])
}
