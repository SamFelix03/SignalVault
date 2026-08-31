'use client'

import { useSearchParams } from 'next/navigation'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits, type Address } from 'viem'
import { Coins, Wallet, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { tusdcConfig } from '@/lib/contracts'
import { TESTNET_TUSDC, TUSDC_DECIMALS } from '@/lib/constants'
import { STT_FAUCET_URL } from '@/lib/tusdc-faucet'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import { TusdcFaucetButton } from '@/components/token/tusdc-faucet-button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function TokenPageContent() {
  const { address, isConnected } = useAccount()
  const searchParams = useSearchParams()
  const vaultParam = searchParams.get('vault') as Address | null

  const { data: balance, refetch: refetchBalance } = useReadContract({
    ...tusdcConfig,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: signalPrice } = useReadContract({
    address: vaultParam ?? undefined,
    abi: StrategyVaultABI,
    functionName: 'signalPrice',
    query: { enabled: Boolean(vaultParam) },
  })

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Fund tUSDC</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          SignalVault uses Somnia testnet tUSDC for signal fees and Event Contract mirror trades on Dreamdex.
        </p>
      </div>

      {!isConnected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Connect your wallet to check balance and mint tUSDC</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-accent" />
              Your balance
            </CardTitle>
            <CardDescription>
              tUSDC: <span className="font-mono text-foreground">{TESTNET_TUSDC}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold font-mono text-foreground">
              {balance !== undefined ? formatUnits(balance, TUSDC_DECIMALS) : '—'}{' '}
              <span className="text-lg text-muted-foreground">tUSDC</span>
            </p>

            {vaultParam && signalPrice !== undefined && (
              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm">
                <p className="text-muted-foreground">
                  Vault signal price:{' '}
                  <span className="font-medium text-foreground">
                    {signalPrice === BigInt(0)
                      ? 'Free'
                      : `${formatUnits(signalPrice, TUSDC_DECIMALS)} tUSDC / signal`}
                  </span>
                </p>
                <Link
                  href={`/vault/${vaultParam}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  Back to vault
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Get testnet tUSDC</p>
              <TusdcFaucetButton onSuccess={() => void refetchBalance()} />
            </div>

            <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-2 text-sm">
              <p className="font-medium text-foreground">Need gas (STT)?</p>
              <p className="text-xs text-muted-foreground">
                Transactions on Somnia testnet require STT for gas fees.
              </p>
              <Button variant="secondary" className="w-full" asChild>
                <a href={STT_FAUCET_URL} target="_blank" rel="noopener noreferrer">
                  Open Somnia testnet faucet
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
