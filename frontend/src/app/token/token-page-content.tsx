'use client'

import { useSearchParams } from 'next/navigation'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther, type Address } from 'viem'
import { Coins, Wallet, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { paymentTokenConfig } from '@/lib/contracts'
import { PAYMENT_TOKEN_ADDRESS } from '@/lib/constants'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TxStatus } from '@/components/common/tx-status'
import { useState } from 'react'

const DEFAULT_MINT_AMOUNT = '1000'

export function TokenPageContent() {
  const { address, isConnected } = useAccount()
  const searchParams = useSearchParams()
  const vaultParam = searchParams.get('vault') as Address | null
  const [mintAmount, setMintAmount] = useState(DEFAULT_MINT_AMOUNT)

  const token = paymentTokenConfig

  const { data: balance, refetch: refetchBalance } = useReadContract({
    ...token!,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(token && address) },
  })

  const { data: signalPrice } = useReadContract({
    address: vaultParam ?? undefined,
    abi: StrategyVaultABI,
    functionName: 'signalPrice',
    query: { enabled: Boolean(vaultParam) },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    ...token!,
    functionName: 'allowance',
    args: address && vaultParam ? [address, vaultParam] : undefined,
    query: { enabled: Boolean(token && address && vaultParam) },
  })

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleMint() {
    if (!token) return
    writeContract({
      ...token,
      functionName: 'mint',
      args: [parseEther(mintAmount || '0')],
    })
  }

  function handleCloseTx() {
    reset()
    if (isSuccess) {
      void refetchBalance()
      void refetchAllowance()
    }
  }

  if (!PAYMENT_TOKEN_ADDRESS || !token) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Payment Token</h1>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Set <code className="text-foreground">NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS</code> in frontend/.env
            after deploying SignalPayToken.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Get SVT</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mint SignalVault Pay (SVT) to your wallet. Use it to pay vault owners per signal when you subscribe.
        </p>
      </div>

      {!isConnected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Connect your wallet to mint SVT</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4 text-accent" />
                Your balance
              </CardTitle>
              <CardDescription>
                Token: <span className="font-mono text-foreground">{PAYMENT_TOKEN_ADDRESS}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold font-mono text-foreground">
                {balance !== undefined ? formatEther(balance) : '—'}{' '}
                <span className="text-lg text-muted-foreground">SVT</span>
              </p>

              {vaultParam && signalPrice !== undefined && (
                <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm">
                  <p className="text-muted-foreground">
                    Vault signal price:{' '}
                    <span className="font-medium text-foreground">
                      {signalPrice === BigInt(0) ? 'Free' : `${formatEther(signalPrice)} SVT / signal`}
                    </span>
                  </p>
                  {allowance !== undefined && signalPrice > BigInt(0) && (
                    <p className="mt-1 text-muted-foreground">
                      Allowance to vault:{' '}
                      <span className="font-mono text-foreground">{formatEther(allowance)} SVT</span>
                    </p>
                  )}
                  <Link
                    href={`/vault/${vaultParam}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Back to vault
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="mintAmount">Mint amount (SVT)</Label>
                <Input
                  id="mintAmount"
                  type="number"
                  min="0"
                  step="1"
                  value={mintAmount}
                  onChange={e => setMintAmount(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Max 10,000 SVT per mint. 1 hour cooldown between mints.
                </p>
              </div>

              <Button onClick={handleMint} disabled={isPending || isConfirming} className="w-full">
                Mint SVT
              </Button>
            </CardContent>
          </Card>

          <TxStatus state={txState} hash={txHash} onClose={handleCloseTx} />
        </>
      )}
    </div>
  )
}
