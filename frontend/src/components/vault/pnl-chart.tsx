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
import { cn } from '@/lib/utils'

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
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">PnL Performance</h2>
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-0.5">
          {ranges.map(r => (
            <button
              key={r}
              onClick={() => handleRange(r)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-all',
                activeRange === r ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradientPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlGradientNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={{ stroke: '#27272a' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={{ stroke: '#27272a' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#e4e4e7' }}
                formatter={(value) => [`${Number(value).toFixed(2)}%`, 'PnL']}
              />
              <Area
                type="monotone"
                dataKey="cumulativePnl"
                stroke="#10b981"
                fill="url(#pnlGradientPos)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            No performance data yet
          </div>
        )}
      </div>
    </div>
  )
}
