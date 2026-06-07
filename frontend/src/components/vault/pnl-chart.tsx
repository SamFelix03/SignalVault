'use client'

import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PnlChartProps {
  data: { date: string; pnl: number; cumulativePnl: number }[]
  onRangeChange?: (range: '1d' | '7d' | '30d') => void
}

const ranges = ['1d', '7d', '30d'] as const

export function PnlChart({ data, onRangeChange }: PnlChartProps) {
  const [activeRange, setActiveRange] = useState<'1d' | '7d' | '30d'>('7d')

  function handleRange(r: '1d' | '7d' | '30d') {
    setActiveRange(r)
    onRangeChange?.(r)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">PnL Performance</CardTitle>
        <Tabs value={activeRange} onValueChange={v => handleRange(v as '1d' | '7d' | '30d')}>
          <TabsList className="h-8">
            {ranges.map(r => (
              <TabsTrigger key={r} value={r} className="px-3 text-xs">
                {r}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.18 145)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.7 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.005 260)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'oklch(0.65 0 0)', fontSize: 11 }}
                  axisLine={{ stroke: 'oklch(0.22 0.005 260)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'oklch(0.65 0 0)', fontSize: 11 }}
                  axisLine={{ stroke: 'oklch(0.22 0.005 260)' }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'oklch(0.12 0.005 260)',
                    border: '1px solid oklch(0.22 0.005 260)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'oklch(0.65 0 0)' }}
                  itemStyle={{ color: 'oklch(0.95 0 0)' }}
                  formatter={(value) => [`${Number(value).toFixed(2)}%`, 'PnL']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke="oklch(0.7 0.18 145)"
                  fill="url(#pnlGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No performance data yet
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
