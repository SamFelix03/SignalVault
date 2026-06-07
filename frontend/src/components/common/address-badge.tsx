'use client'

import { useState } from 'react'
import { Copy, ExternalLink, Check } from 'lucide-react'
import { cn, truncateAddress } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
    <Badge variant="secondary" className={cn('gap-1.5 font-mono text-xs', className)}>
      {truncateAddress(address)}
      {showCopy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={handleCopy} className="transition-colors hover:text-foreground">
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy address</TooltipContent>
        </Tooltip>
      )}
      {showExplorer && (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </TooltipTrigger>
          <TooltipContent>View on explorer</TooltipContent>
        </Tooltip>
      )}
    </Badge>
  )
}
