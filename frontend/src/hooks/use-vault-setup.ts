'use client'

import { type Address, type Hex } from 'viem'
import { API_URL } from '@/lib/contracts'

export type SetupStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type SetupRunStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface SetupStep {
  id: string
  label: string
  status: SetupStepStatus
  txHash?: string
  error?: string
}

export interface SetupTransaction {
  step: string
  label: string
  txHash: string
  status: 'pending' | 'confirmed' | 'failed'
}

export interface SetupLogEntry {
  ts: string
  level: 'info' | 'warn' | 'success' | 'error'
  message: string
  step?: string
}

export interface ResolvedDeployment {
  vaultAddress: Address
  vaultId: string
  strategist: Address
  orchestrator: Address
  mirrorReactor: Address
  stopReactor: Address
  drawdownGuard: Address
  epochCron: Address
  performanceLedger: Address
  feeDistributor: Address
  explorerUrl: string
}

export async function resolveDeployTx(txHash: Hex): Promise<ResolvedDeployment> {
  const res = await fetch(`${API_URL}/api/setup/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Failed to resolve deployment')
  return body
}
