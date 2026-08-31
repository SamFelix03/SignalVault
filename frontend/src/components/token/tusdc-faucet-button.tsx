'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { TxStatus } from '@/components/common/tx-status'
import { tusdcConfig } from '@/lib/contracts'
import { TUSDC_DECIMALS } from '@/lib/constants'
import { TUSDC_FAUCET_CAP, tusdcFaucetConfig } from '@/lib/tusdc-faucet'

interface TusdcFaucetButtonProps {
  onSuccess?: () => void
  className?: string
}

export function TusdcFaucetButton({ onSuccess, className }: TusdcFaucetButtonProps) {
  const { address, isConnected } = useAccount()
  const [dismissed, setDismissed] = useState(false)

  const { data: balance, refetch: refetchBalance } = useReadContract({
    ...tusdcConfig,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleFaucet() {
    writeContract({
      ...tusdcFaucetConfig,
      functionName: 'faucet',
      args: [TUSDC_FAUCET_CAP],
    })
  }

  function handleClose() {
    const wasSuccess = isSuccess
    reset()
    setDismissed(true)
    if (wasSuccess) {
      void refetchBalance()
      onSuccess?.()
    }
  }

  if (!isConnected) return null

  return (
    <>
      <Button
        onClick={handleFaucet}
        disabled={isPending || isConfirming}
        className={className ?? 'w-full bg-accent text-accent-foreground hover:bg-accent/90'}
      >
        {isPending || isConfirming ? 'Minting tUSDC…' : 'Get 10,000 tUSDC'}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Mints testnet tUSDC to your connected wallet (max 10,000 per transaction).
        {balance !== undefined && (
          <>
            {' '}
            Balance:{' '}
            <span className="font-mono text-foreground">
              {formatUnits(balance, TUSDC_DECIMALS)} tUSDC
            </span>
          </>
        )}
      </p>
      <TxStatus
        state={dismissed && txState === 'idle' ? 'idle' : txState}
        hash={txHash}
        error={writeError?.message}
        onClose={handleClose}
      />
    </>
  )
}
