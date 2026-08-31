'use client'

import { useState } from 'react'
import { type Address, type Hex } from 'viem'
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { usePerpMirrorReadiness } from '@/hooks/use-perp-mirror-readiness'
import { Button } from '@/components/ui/button'
import { TxStatus } from '@/components/common/tx-status'

const mirrorReactorAbi = [
  {
    type: 'function',
    name: 'registerSubscription',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const vaultAbi = [
  {
    type: 'function',
    name: 'setEventRouter',
    inputs: [{ name: '_router', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

interface PerpVaultOwnerSetupProps {
  vaultAddress: Address
}

export function PerpVaultOwnerSetup({ vaultAddress }: PerpVaultOwnerSetupProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { status, loading, refresh } = usePerpMirrorReadiness(vaultAddress)
  const [busy, setBusy] = useState<'router' | 'sub' | null>(null)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (!status?.isPerp || status.mirrorsReady) return null

  async function handleUpgradeRouter() {
    if (!status?.deployBytecode || !walletClient || !publicClient || !address) return
    setBusy('router')
    try {
      const deployHash = await walletClient.deployContract({
        account: address,
        chain: walletClient.chain,
        abi: [{ type: 'constructor', inputs: [{ type: 'address' }, { type: 'address' }], stateMutability: 'nonpayable' }],
        bytecode: status.deployBytecode as Hex,
        args: [status.mirrorReactor, status.marginBank],
      })
      const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
      const newRouter = deployReceipt.contractAddress
      if (!newRouter) throw new Error('PerpRouter deploy missing address')

      writeContract({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: 'setEventRouter',
        args: [newRouter],
      })
    } catch (err) {
      console.error(err)
      setBusy(null)
    }
  }

  function handleRegisterSubscription() {
    if (!status) return
    setBusy('sub')
    writeContract({
      address: status.mirrorReactor,
      abi: mirrorReactorAbi,
      functionName: 'registerSubscription',
    })
  }

  function handleClose() {
    reset()
    setBusy(null)
    if (isSuccess) refresh()
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-destructive">Perp mirrors not active on this vault</p>
        <p className="text-xs text-muted-foreground mt-1">
          Subscribers can approve USDso, but on-chain mirror trades only run after the vault owner completes these steps.
        </p>
      </div>
      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
        {status.blockers.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {status.needsUpgrade && status.deployBytecode && (
          <Button size="sm" variant="destructive" disabled={loading || busy !== null} onClick={() => void handleUpgradeRouter()}>
            {busy === 'router' ? 'Upgrading PerpRouter…' : 'Deploy upgraded PerpRouter'}
          </Button>
        )}
        {!status.mirrorSubscriptionRegistered && (
          <Button size="sm" variant="secondary" disabled={loading || busy !== null || status.needsUpgrade} onClick={handleRegisterSubscription}>
            Register MirrorReactor subscription
          </Button>
        )}
      </div>
      {status.needsUpgrade && !status.deployBytecode && (
        <p className="text-xs text-destructive">Restart backend after `forge build` to enable router upgrade.</p>
      )}
      <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
    </div>
  )
}
