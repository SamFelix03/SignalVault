'use client'

import { useMemo } from 'react'
import { type Address, formatUnits, maxUint256 } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { vaultConfig, erc20MinimalAbi } from '@/lib/contracts'
import { useMirrorWallet } from '@/hooks/use-mirror-wallet'
import { usePerpMirrorReadiness } from '@/hooks/use-perp-mirror-readiness'
import { TxStatus } from '@/components/common/tx-status'
import { Button } from '@/components/ui/button'

const USDSO = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address
const USDSO_DECIMALS = 18

interface PerpFollowerSetupProps {
  vaultAddress: Address
}

export function PerpFollowerSetup({ vaultAddress }: PerpFollowerSetupProps) {
  const { address } = useAccount()
  const { mirrorWallet, loading: walletLoading, error: walletError } = useMirrorWallet(
    vaultAddress,
    address,
  )
  const { status: readiness, loading: readinessLoading } = usePerpMirrorReadiness(vaultAddress)

  const { data: signal } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'getCurrentSignal',
  })

  const { data: followerCfg } = useReadContract({
    ...vaultConfig(vaultAddress),
    functionName: 'getFollowerConfig',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const marginPerSignal = useMemo(() => {
    if (!followerCfg || !signal) return null
    const raw =
      (followerCfg.maxPositionSize * BigInt(signal.sizeBps) * BigInt(followerCfg.riskPct)) /
      (10_000n * 10_000n)
    return Number(formatUnits(raw * 1_000_000_000_000n, USDSO_DECIMALS))
  }, [followerCfg, signal])

  const { data: usdsoBalance } = useReadContract({
    address: USDSO,
    abi: erc20MinimalAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: walletAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDSO,
    abi: erc20MinimalAbi,
    functionName: 'allowance',
    args: address && mirrorWallet ? [address, mirrorWallet] : undefined,
    query: { enabled: Boolean(address && mirrorWallet) },
  })

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const hasAllowance = walletAllowance !== undefined && walletAllowance >= maxUint256 / 2n
  const hasEnoughUsdso =
    marginPerSignal == null ||
    marginPerSignal <= 0 ||
    (usdsoBalance !== undefined && Number(formatUnits(usdsoBalance, USDSO_DECIMALS)) >= marginPerSignal)
  const mirrorsReady = readiness?.mirrorsReady ?? false
  const followerReady = hasAllowance && hasEnoughUsdso && mirrorsReady

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleApprove() {
    if (!mirrorWallet) return
    writeContract({
      address: USDSO,
      abi: erc20MinimalAbi,
      functionName: 'approve',
      args: [mirrorWallet, maxUint256],
    })
  }

  function handleClose() {
    reset()
    if (isSuccess) void refetchAllowance()
  }

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Perp mirror funding</p>
        <p className="text-xs text-muted-foreground mt-1">
          Approve USDso once. Each signal pulls only the margin needed (~like tUSDC on binary vaults).
          No MarginBank pre-deposit or operator grant required.
        </p>
        {marginPerSignal != null && (
          <p className="text-xs text-muted-foreground mt-2">
            Estimated pull per active signal:{' '}
            <span className="font-mono text-foreground">
              {marginPerSignal > 0 ? `~${marginPerSignal.toFixed(2)}` : '—'} USDso
            </span>
            {marginPerSignal === 0 && (
              <span className="block text-muted-foreground/80">(vault signal is flat — pulls apply on LONG/SHORT)</span>
            )}
          </p>
        )}
        {usdsoBalance !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            Wallet balance:{' '}
            <span className={`font-mono ${hasEnoughUsdso ? 'text-foreground' : 'text-destructive'}`}>
              {formatUnits(usdsoBalance, USDSO_DECIMALS)} USDso
            </span>
            {!hasEnoughUsdso && marginPerSignal != null && marginPerSignal > 0 && (
              <span className="block text-destructive mt-1">
                Need at least ~{marginPerSignal.toFixed(2)} USDso in wallet for the next mirror pull.
              </span>
            )}
          </p>
        )}
        {mirrorWallet && (
          <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
            Mirror wallet: {mirrorWallet}
          </p>
        )}
        {walletError && (
          <p className="text-xs text-destructive mt-1">{walletError}</p>
        )}
      </div>

      {!mirrorsReady && !readinessLoading && readiness?.blockers?.length ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          <p className="text-xs font-medium text-destructive">Vault not ready for on-chain mirrors</p>
          {readiness.blockers.map((b) => (
            <p key={b} className="text-xs text-muted-foreground">{b}</p>
          ))}
          <p className="text-xs text-muted-foreground">
            Your USDso approval is saved, but positions will not open until the vault owner finishes setup above.
          </p>
        </div>
      ) : null}

      {!hasAllowance ? (
        <Button
          size="sm"
          disabled={!mirrorWallet || walletLoading || isPending || isConfirming}
          onClick={handleApprove}
        >
          {walletLoading ? 'Resolving mirror wallet…' : 'Approve USDso for mirror pulls'}
        </Button>
      ) : followerReady ? (
        <p className="text-xs text-success">Ready — mirrors will pull USDso automatically on each signal.</p>
      ) : hasAllowance && mirrorsReady && !hasEnoughUsdso ? (
        <p className="text-xs text-destructive">USDso approved, but wallet balance is too low for the next signal.</p>
      ) : hasAllowance ? (
        <p className="text-xs text-muted-foreground">USDso approved — waiting on vault mirror setup.</p>
      ) : null}

      <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
    </div>
  )
}
