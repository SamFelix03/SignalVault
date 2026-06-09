import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBps(bps: number | bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`
}

export function formatPrice(price: number | bigint, decimals = 2): string {
  const raw = typeof price === 'bigint' ? Number(price) : price
  const num = raw > 1e15 ? raw / 1e18 : raw > 1e6 ? raw / 1e2 : raw
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** dreamDEX pool price / notional in raw on-chain units → USD display */
export function formatPoolPrice(raw: number | bigint | string): string {
  const n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'string' ? Number(raw) : raw
  if (n === 0) return '—'
  const usd = n > 1e15 ? n / 1e14 : n > 1e6 ? n / 100 : n
  return usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** On-chain funding field stores CoinGecko 24h change as abs(pct) × 1e8 */
export function formatFundingChange(raw: number | bigint): string {
  const n = typeof raw === 'bigint' ? Number(raw) : raw
  if (n === 0) return '—'
  const pct = n / 1e8
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function directionLabel(direction: number): 'LONG' | 'SHORT' | 'FLAT' {
  if (direction === 1) return 'LONG'
  if (direction === -1 || direction === 2) return 'SHORT'
  return 'FLAT'
}

export function directionColor(direction: number): string {
  if (direction === 1) return 'text-success'
  if (direction === -1 || direction === 2) return 'text-destructive'
  return 'text-warning'
}

export function directionBg(direction: number): string {
  if (direction === 1) return 'bg-success/10 border-success/30'
  if (direction === -1 || direction === 2) return 'bg-destructive/10 border-destructive/30'
  return 'bg-warning/10 border-warning/30'
}

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function timeAgo(timestamp: number | Date): string {
  const now = Date.now()
  const t = typeof timestamp === 'number' ? timestamp * 1000 : timestamp.getTime()
  const diff = Math.floor((now - t) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000
      ? `${(abs / 1_000).toFixed(2)}K`
      : abs.toFixed(2)
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

export function formatPnlPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}
