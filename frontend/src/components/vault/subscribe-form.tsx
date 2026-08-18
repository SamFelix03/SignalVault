'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi'
import { parseEther, formatEther, maxUint256, type Address } from 'viem'
import { vaultConfig, paymentTokenConfig } from '@/lib/contracts'
import { TxStatus } from '@/components/common/tx-status'
import { TelegramAlertsSetup } from '@/components/vault/telegram-alerts-setup'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'


interface SubscribeFormProps {
  vaultAddress: Address
  isSubscribed: boolean
  onSuccess?: () => void
}

export function SubscribeForm({ vaultAddress, isSubscribed, onSuccess }: SubscribeFormProps) {
  const { address } = useAccount()
  const [riskBps, setRiskBps] = useState(1000)
  const [maxPositionUsd, setMaxPositionUsd] = useState('1000')
  const [maxSlippageBps, setMaxSlippageBps] = useState(100)
  const [stopLossBuffer, setStopLossBuffer] = useState('50')
  const [pendingAction, setPendingAction] = useState<'approve' | 'subscribe' | null>(null)

  const { data: signalPrice } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'signalPrice',
  })

  const token = paymentTokenConfig
  const price = signalPrice ?? BigInt(0)
  const isPaidVault = price > BigInt(0) && Boolean(token)

  const { data: tokenBalance } = useReadContract({
    ...token!,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(isPaidVault && token && address) },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    ...token!,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    query: { enabled: Boolean(isPaidVault && token && address) },
  })

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const hasEnoughAllowance =
    !isPaidVault || (allowance !== undefined && allowance >= price)
  const hasUnlimitedAllowance =
    allowance !== undefined && allowance >= maxUint256 / BigInt(2)
  const hasEnoughBalance =
    !isPaidVault || (tokenBalance !== undefined && tokenBalance >= price)

  function handleApprove() {
    if (!token) return
    setPendingAction('approve')
    writeContract({
      ...token,
      functionName: 'approve',
      args: [vaultAddress, maxUint256],
    })
  }

  function handleSubscribe() {
    setPendingAction('subscribe')
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'subscribe',
      args: [{
        riskPct: riskBps,
        maxPositionSize: parseEther(maxPositionUsd),
        maxSlippageBps: maxSlippageBps,
        stopLossBuffer: parseEther(stopLossBuffer),
        active: true,
      }],
    })
  }

  function handleUnsubscribe() {
    setPendingAction(null)
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'unsubscribe',
    })
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleClose() {
    const wasApprove = pendingAction === 'approve'
    reset()
    setPendingAction(null)
    if (isSuccess) {
      if (wasApprove) void refetchAllowance()
      else onSuccess?.()
    }
  }

  if (!address) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Connect your wallet to subscribe</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isSubscribed ? 'Subscribed to vault' : 'Subscribe to vault'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isSubscribed ? (
          <div className="space-y-4">
            {isPaidVault && (
              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm space-y-2">
                <p className="text-foreground">
                  Signal price:{' '}
                  <span className="font-mono font-medium">{formatEther(price)} SVT</span> per signal
                </p>
                <p className="text-xs text-muted-foreground">
                  One-time approval lets the vault pull {formatEther(price)} SVT from your wallet
                  each time a signal fires, until you unsubscribe.
                </p>
                {tokenBalance !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Your balance: <span className="font-mono text-foreground">{formatEther(tokenBalance)} SVT</span>
                    {!hasEnoughBalance && (
                      <>
                        {' '}
                        —{' '}
                        <Link href={`/token?vault=${vaultAddress}`} className="text-accent hover:underline">
                          Mint SVT
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {allowance !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Allowance: <span className="font-mono text-foreground">{formatEther(allowance)} SVT</span>
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>
                Risk Level: <span className="font-mono text-foreground">{(riskBps / 100).toFixed(0)}%</span>
              </Label>
              <Slider min={100} max={10000} step={100} value={[riskBps]} onValueChange={v => setRiskBps(v[0])} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPosition">Max Position (USD)</Label>
              <Input
                id="maxPosition"
                type="number"
                value={maxPositionUsd}
                onChange={e => setMaxPositionUsd(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Max Slippage: <span className="font-mono text-foreground">{(maxSlippageBps / 100).toFixed(1)}%</span>
              </Label>
              <Slider min={10} max={500} step={10} value={[maxSlippageBps]} onValueChange={v => setMaxSlippageBps(v[0])} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stopLoss">Stop Loss Buffer (USD)</Label>
              <Input
                id="stopLoss"
                type="number"
                value={stopLossBuffer}
                onChange={e => setStopLossBuffer(e.target.value)}
                className="font-mono"
              />
            </div>

            {isPaidVault && !hasEnoughAllowance && (
              <Button
                onClick={handleApprove}
                disabled={isPending || isConfirming || !hasEnoughBalance}
                variant="secondary"
                className="w-full"
              >
                Approve SVT spending
              </Button>
            )}

            <Button
              onClick={handleSubscribe}
              disabled={
                Boolean(isPending || isConfirming || (isPaidVault && (!hasEnoughAllowance || !hasEnoughBalance)))
              }
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Subscribe
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-success">You are subscribed to this vault.</p>
            {isPaidVault && allowance !== undefined && (
              <p className="text-xs text-muted-foreground">
                SVT allowance:{' '}
                <span className="font-mono text-foreground">
                  {hasUnlimitedAllowance ? 'Unlimited' : `${formatEther(allowance)} SVT`}
                </span>
              </p>
            )}
            {isPaidVault && !hasUnlimitedAllowance && (
              <Button
                onClick={handleApprove}
                disabled={isPending || isConfirming}
                variant="secondary"
                className="w-full"
              >
                Approve SVT spending
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleUnsubscribe}
              disabled={isPending || isConfirming}
              className="w-full"
            >
              Unsubscribe
            </Button>

            <TelegramAlertsSetup vaultAddress={vaultAddress} />
          </div>
        )}

        <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
      </CardContent>
    </Card>
  )
}
