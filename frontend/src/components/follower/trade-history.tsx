'use client'

import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { cn, formatPrice, formatPnlPercent, timeAgo } from '@/lib/utils'
import { SignalIndicator } from '@/components/leaderboard/signal-indicator'
import type { TradeRecord } from '@/types/vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TradeHistoryProps {
  trades: TradeRecord[]
  vaultAddress: string
}

export function TradeHistory({ trades, vaultAddress }: TradeHistoryProps) {
  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No trades yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trade History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Direction</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="text-center">Reasoning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade, i) => (
              <TableRow key={`${trade.epoch}-${i}`} className="group">
                <TableCell>
                  <SignalIndicator direction={trade.direction} size="sm" pulse={false} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  ${formatPrice(Number(trade.entryPrice))}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  ${formatPrice(Number(trade.exitPrice))}
                </TableCell>
                <TableCell className={cn('text-right font-mono text-sm font-semibold', trade.pnl >= 0 ? 'text-success' : 'text-destructive')}>
                  {formatPnlPercent(trade.pnlPercent)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {trade.timestamp ? timeAgo(trade.timestamp) : '—'}
                </TableCell>
                <TableCell className="text-center">
                  {trade.reasoningHash ? (
                    <Link
                      href={vaultAddress ? `/vault/${vaultAddress}/audit/${trade.reasoningHash}` : '#'}
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
