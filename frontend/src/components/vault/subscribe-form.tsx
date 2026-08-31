'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi'
import { parseUnits, formatUnits, maxUint256, type Address } from 'viem'
import { vaultConfig, tusdcConfig } from '@/lib/contracts'
import { TUSDC_DECIMALS } from '@/lib/constants'
import { TxStatus } from '@/components/common/tx-status'
import { TelegramAlertsSetup } from '@/components/vault/telegram-alerts-setup'
import { PerpFollowerSetup } from '@/components/vault/perp-follower-setup'
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

type PendingAction = 'approve-vault' | 'approve-router' | 'subscribe' | null

export function SubscribeForm({ vaultAddress, isSubscribed, onSuccess }: SubscribeFormProps) {
  const { address } = useAccount()
  const [riskBps, setRiskBps] = useState(1000)
  const [maxCollateral, setMaxCollateral] = useState('100')
  const [maxSlippageBps, setMaxSlippageBps] = useState(300)
  const [stopLossBuffer, setStopLossBuffer] = useState('0')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const { data: signalPrice } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'signalPrice',
  })

  const { data: eventRouter } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'eventRouter',
  })

  const { data: instrumentTypeRaw } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'instrumentType',
  })

  const isPerpVault = Number(instrumentTypeRaw ?? 0) === 1

  const price = signalPrice ?? BigInt(0)
  const isPaidVault = price > BigInt(0)
  const routerAddress = (eventRouter as Address | undefined) ?? undefined
  const maxCollateralWei = parseUnits(maxCollateral || '0', TUSDC_DECIMALS)

  const { data: tusdcBalance, refetch: refetchBalance } = useReadContract({
    ...tusdcConfig,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: vaultAllowance, refetch: refetchVaultAllowance } = useReadContract({
    ...tusdcConfig,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    query: { enabled: Boolean(isPaidVault && address) },
  })

  const { data: routerAllowance, refetch: refetchRouterAllowance } = useReadContract({
    ...tusdcConfig,
    functionName: 'allowance',
    args: address && routerAddress ? [address, routerAddress] : undefined,
    query: { enabled: Boolean(address && routerAddress) },
  })

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const hasEnoughVaultAllowance =
    !isPaidVault || (vaultAllowance !== undefined && vaultAllowance >= price)
  const hasUnlimitedVaultAllowance =
    vaultAllowance !== undefined && vaultAllowance >= maxUint256 / BigInt(2)
  const hasEnoughRouterAllowance =
    routerAllowance !== undefined && maxCollateralWei > BigInt(0) && routerAllowance >= maxCollateralWei
  const hasEnoughBalanceForFees =
    !isPaidVault || (tusdcBalance !== undefined && tusdcBalance >= price)
  const hasEnoughBalanceForTrading =
    isPerpVault || (tusdcBalance !== undefined && tusdcBalance >= maxCollateralWei)

  function handleApproveVault() {
    setPendingAction('approve-vault')
    writeContract({
      ...tusdcConfig,
      functionName: 'approve',
      args: [vaultAddress, maxUint256],
    })
  }

  function handleApproveRouter() {
    if (!routerAddress) return
    setPendingAction('approve-router')
    writeContract({
      ...tusdcConfig,
      functionName: 'approve',
      args: [routerAddress, maxCollateralWei],
    })
  }

  function handleSubscribe() {
    setPendingAction('subscribe')
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'subscribe',
      args: [{
        riskPct: riskBps,
        maxPositionSize: maxCollateralWei,
        maxSlippageBps: maxSlippageBps,
        stopLossBuffer: parseUnits(stopLossBuffer || '0', TUSDC_DECIMALS),
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
    const action = pendingAction
    reset()
    setPendingAction(null)
    if (isSuccess) {
      if (action === 'approve-vault') void refetchVaultAllowance()
      else if (action === 'approve-router') void refetchRouterAllowance()
      else void refetchBalance()
      if (action === 'subscribe') onSuccess?.()
    }
  }

  const needsVaultApproval = isPaidVault && !hasEnoughVaultAllowance
  const needsRouterApproval = Boolean(routerAddress) && !isPerpVault && !hasEnoughRouterAllowance
  const canSubscribe =
    !needsVaultApproval &&
    !needsRouterApproval &&
    hasEnoughBalanceForFees &&
    hasEnoughBalanceForTrading &&
    maxCollateralWei > BigInt(0)

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
            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm space-y-2">
              {isPerpVault ? (
                <>
                  <p className="text-foreground font-medium">Perp vault — USDso pulled per signal</p>
                  <p className="text-xs text-muted-foreground">
                    Signal fees use tUSDC. Mirror trades pull USDso from your wallet automatically each
                    signal (approve your mirror wallet after subscribing). Swap STT → USDso on SOMI/USDso if needed.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-foreground font-medium">All costs use tUSDC</p>
                  <p className="text-xs text-muted-foreground">
                    One token for signal fees and Event Contract mirror trades on Somnia Markets.
                  </p>
                </>
              )}
              {isPaidVault && (
                <p className="text-xs text-muted-foreground">
                  Signal price:{' '}
                  <span className="font-mono text-foreground">
                    {formatUnits(price, TUSDC_DECIMALS)} tUSDC
                  </span>{' '}
                  per mirrored signal (paid to strategist).
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Collateral budget:{' '}
                <span className="font-mono text-foreground">{maxCollateral} tUSDC</span> max per mirror.
              </p>
              {tusdcBalance !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Your tUSDC balance:{' '}
                  <span className="font-mono text-foreground">
                    {formatUnits(tusdcBalance, TUSDC_DECIMALS)} tUSDC
                  </span>
                  {!hasEnoughBalanceForTrading && (
                    <span className="block mt-1">
                      <Link href="/token" className="text-accent hover:underline">
                        Get tUSDC
                      </Link>{' '}
                      for mirror trading and signal fees.
                    </span>
                  )}
                </p>
              )}
              {isPaidVault && vaultAllowance !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Vault allowance (signal fees):{' '}
                  <span className="font-mono text-foreground">
                    {hasUnlimitedVaultAllowance
                      ? 'Unlimited'
                      : `${formatUnits(vaultAllowance, TUSDC_DECIMALS)} tUSDC`}
                  </span>
                </p>
              )}
              {routerAllowance !== undefined && routerAddress && (
                <p className="text-xs text-muted-foreground">
                  Router allowance (trading):{' '}
                  <span className="font-mono text-foreground">
                    {formatUnits(routerAllowance, TUSDC_DECIMALS)} tUSDC
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Risk Level: <span className="font-mono text-foreground">{(riskBps / 100).toFixed(0)}%</span>
              </Label>
              <Slider min={100} max={10000} step={100} value={[riskBps]} onValueChange={v => setRiskBps(v[0])} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCollateral">
                {isPerpVault ? 'Max margin budget (USDso)' : 'Max Collateral (tUSDC)'}
              </Label>
              <Input
                id="maxCollateral"
                type="number"
                value={maxCollateral}
                onChange={e => setMaxCollateral(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Max Slippage: <span className="font-mono text-foreground">{(maxSlippageBps / 100).toFixed(1)}%</span>
              </Label>
              <Slider min={10} max={500} step={10} value={[maxSlippageBps]} onValueChange={v => setMaxSlippageBps(v[0])} />
            </div>

            {needsVaultApproval && (
              <Button
                onClick={handleApproveVault}
                disabled={isPending || isConfirming || !hasEnoughBalanceForFees}
                variant="secondary"
                className="w-full"
              >
                Approve tUSDC for signal fees
              </Button>
            )}

            {needsRouterApproval && (
              <Button
                onClick={handleApproveRouter}
                disabled={isPending || isConfirming || !hasEnoughBalanceForTrading || !routerAddress}
                variant="secondary"
                className="w-full"
              >
                Approve tUSDC for mirror trading
              </Button>
            )}

            <Button
              onClick={handleSubscribe}
              disabled={Boolean(isPending || isConfirming || !canSubscribe)}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Subscribe
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-success">You are subscribed to this vault.</p>
            {isPaidVault && vaultAllowance !== undefined && (
              <p className="text-xs text-muted-foreground">
                Vault allowance (signal fees):{' '}
                <span className="font-mono text-foreground">
                  {hasUnlimitedVaultAllowance
                    ? 'Unlimited'
                    : `${formatUnits(vaultAllowance, TUSDC_DECIMALS)} tUSDC`}
                </span>
              </p>
            )}
            {routerAllowance !== undefined && (
              <p className="text-xs text-muted-foreground">
                Router allowance (trading):{' '}
                <span className="font-mono text-foreground">
                  {formatUnits(routerAllowance, TUSDC_DECIMALS)} tUSDC
                </span>
                {routerAddress && (
                  <span className="block mt-1 font-mono text-[10px] break-all">
                    Router: {routerAddress}
                  </span>
                )}
              </p>
            )}
            {needsRouterApproval && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Approve tUSDC for the vault&apos;s trading router so mirrored binary orders can pull collateral.
              </p>
            )}
            {isPaidVault && !hasUnlimitedVaultAllowance && (
              <Button
                onClick={handleApproveVault}
                disabled={isPending || isConfirming}
                variant="secondary"
                className="w-full"
              >
                Increase tUSDC allowance (signal fees)
              </Button>
            )}
            {needsRouterApproval && (
              <Button
                onClick={handleApproveRouter}
                disabled={isPending || isConfirming}
                variant="secondary"
                className="w-full"
              >
                Approve router for trading ({maxCollateral} tUSDC)
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
            {isPerpVault && <PerpFollowerSetup vaultAddress={vaultAddress} />}
          </div>
        )}

        <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
      </CardContent>
    </Card>
  )
}
