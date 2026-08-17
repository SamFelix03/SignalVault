'use client'

import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, type Address } from 'viem'
import { vaultConfig } from '@/lib/contracts'
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

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  function handleSubscribe() {
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
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'unsubscribe',
    })
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleClose() {
    reset()
    if (isSuccess) onSuccess?.()
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

            <Button
              onClick={handleSubscribe}
              disabled={isPending || isConfirming}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Subscribe
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-success">You are subscribed to this vault.</p>
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
