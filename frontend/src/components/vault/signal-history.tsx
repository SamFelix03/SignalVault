'use client'

import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { formatLimitPrice, formatMarketId, timeAgo } from '@/lib/utils'
import { SignalIndicator } from '@/components/leaderboard/signal-indicator'
import type { Signal } from '@/types/vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface SignalHistoryProps {
  signals: Signal[]
  vaultAddress: string
  instrumentType?: 'BINARY' | 'PERP'
}

function formatSignalLimit(limitPrice: bigint, instrumentType: 'BINARY' | 'PERP'): string {
  if (limitPrice <= BigInt(0)) return '—'
  if (instrumentType === 'PERP') {
    return Number(limitPrice) / 1e18 < 0.0001
      ? limitPrice.toString()
      : (Number(limitPrice) / 1e18).toFixed(4)
  }
  return formatLimitPrice(limitPrice)
}

export function SignalHistory({ signals, vaultAddress, instrumentType = 'BINARY' }: SignalHistoryProps) {
  if (signals.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No signals recorded yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signal History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Epoch</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Market</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Limit</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="text-center">Audit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.map((sig, i) => (
              <TableRow key={`${sig.epoch}-${i}`}>
                <TableCell className="font-mono text-sm">#{sig.epoch}</TableCell>
                <TableCell>
                  <SignalIndicator direction={sig.direction} size="sm" pulse={false} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatMarketId(sig.marketId)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {(sig.sizeBps / 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatSignalLimit(sig.limitPrice, instrumentType)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {sig.timestamp ? timeAgo(sig.timestamp) : '—'}
                </TableCell>
                <TableCell className="text-center">
                  {sig.reasoningHash && sig.reasoningHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' ? (
                    <Link
                      href={`/vault/${vaultAddress}/audit/${sig.reasoningHash}`}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                      View
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
