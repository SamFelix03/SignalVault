import { type Address } from 'viem'
import { API_URL } from '@/lib/contracts'

export async function fetchMirrorWallet(
  vault: Address,
  follower: Address,
): Promise<{ mirrorWallet: Address; perpRouter: Address }> {
  const res = await fetch(`${API_URL}/api/vaults/${vault}/mirror-wallet/${follower}`)
  if (!res.ok) {
    throw new Error('Failed to resolve mirror wallet')
  }
  return res.json() as Promise<{ mirrorWallet: Address; perpRouter: Address }>
}

export type PerpRouterStatus = {
  isPerp: boolean
  mirrorsReady: boolean
  needsUpgrade: boolean
  mirrorSubscriptionRegistered: boolean
  perpRouter: Address
  mirrorReactor: Address
  marginBank: Address
  deployBytecode?: string
  blockers: string[]
}

export async function fetchPerpRouterStatus(vault: Address): Promise<PerpRouterStatus> {
  const res = await fetch(`${API_URL}/api/vaults/${vault}/perp-router-status`)
  if (!res.ok) {
    throw new Error('Failed to check perp router')
  }
  return res.json() as Promise<PerpRouterStatus>
}
