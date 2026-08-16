'use client'

import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { formatStopPrice, timeAgo } from '@/lib/utils'
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
}

export function SignalHistory({ signals, vaultAddress }: SignalHistoryProps) {
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
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Stop Price</TableHead>
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
                <TableCell className="text-right font-mono text-sm">
                  {(sig.sizeBps / 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  ${formatStopPrice(sig.stopPrice)}
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
