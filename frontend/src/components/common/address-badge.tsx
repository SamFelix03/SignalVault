'use client'

import { useState } from 'react'
import { Copy, ExternalLink, Check } from 'lucide-react'
import { cn, truncateAddress } from '@/lib/utils'

interface AddressBadgeProps {
  address: string
  className?: string
  showCopy?: boolean
  showExplorer?: boolean
}

export function AddressBadge({ address, className, showCopy = true, showExplorer = true }: AddressBadgeProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const explorerUrl = `https://shannon-explorer.somnia.network/address/${address}`

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2 py-1 font-mono text-xs text-zinc-400', className)}>
      {truncateAddress(address)}
      {showCopy && (
        <button onClick={handleCopy} className="hover:text-zinc-200 transition-colors" title="Copy address">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
      {showExplorer && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-200 transition-colors" title="View on explorer">
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  )
}
