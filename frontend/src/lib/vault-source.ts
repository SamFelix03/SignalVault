import type { VaultSourceType } from '@/types/vault'

/** Normalize API / on-chain source type to frontend `'agent' | 'wallet'`. */
export function normalizeSourceType(value: unknown): VaultSourceType {
  if (value === 'wallet' || value === 'WALLET' || value === 1 || value === '1') return 'wallet'
  return 'agent'
}

export function isWalletSourceType(value: unknown): boolean {
  return normalizeSourceType(value) === 'wallet'
}
