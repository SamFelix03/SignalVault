'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { type Address } from 'viem'
import { Button } from '@/components/ui/button'
import { AddressBadge } from '@/components/common/address-badge'

interface VaultAddressCardProps {
  address: Address
  title?: string
  showEnvHint?: boolean
}

export function VaultAddressCard({
  address,
  title = 'Your vault address',
  showEnvHint = true,
}: VaultAddressCardProps) {
  const [envCopied, setEnvCopied] = useState(false)

  async function copyEnvLine() {
    await navigator.clipboard.writeText(`VAULT_ADDRESS=${address}`)
    setEnvCopied(true)
    setTimeout(() => setEnvCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <AddressBadge address={address} />
      </div>
      <p className="break-all font-mono text-xs leading-relaxed text-foreground">{address}</p>
      {showEnvHint && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={copyEnvLine}>
            {envCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {envCopied ? 'Copied!' : 'Copy for .env'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Paste into <code className="font-mono">examples/rsi-agent/.env</code>
          </span>
        </div>
      )}
    </div>
  )
}
