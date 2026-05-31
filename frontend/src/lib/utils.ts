import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBps(bps: number | bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`
}

export function formatPrice(price: number | bigint, decimals = 2): string {
  const num = typeof price === 'bigint' ? Number(price) / 1e18 : price
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function directionLabel(direction: number): 'LONG' | 'SHORT' | 'FLAT' {
  if (direction === 1) return 'LONG'
  if (direction === 2) return 'SHORT'
  return 'FLAT'
}

export function directionColor(direction: number): string {
  if (direction === 1) return 'text-emerald-400'
  if (direction === 2) return 'text-red-400'
  return 'text-amber-400'
}

export function directionBg(direction: number): string {
  if (direction === 1) return 'bg-emerald-500/20 border-emerald-500/40'
  if (direction === 2) return 'bg-red-500/20 border-red-500/40'
  return 'bg-amber-500/20 border-amber-500/40'
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
