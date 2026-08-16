'use client'

import { useState } from 'react'
import { type Address } from 'viem'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ExternalSignalPublisherABI } from '@/abis/ExternalSignalPublisher'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TxStatus } from '@/components/common/tx-status'
import { VaultAddressCard } from '@/components/deploy/vault-address-card'
import { formatUsdCents } from '@/lib/utils'

interface ConnectAgentPanelProps {
  vaultAddress: Address
  publisherAddress: Address
}

/** Example stop for ~$1,860 ETH — on-chain value is USD cents. */
const DEFAULT_STOP_PRICE_CENTS = '186000'

function buildSnippet(vault: string, tab: 'ts' | 'js'): string {
  if (tab === 'js') {
    return `import { SignalVault } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: '${vault}',
  privateKey: process.env.PRIVATE_KEY,
})

await vault.publish({
  direction: 'LONG',
  sizeBps: 1500,
  stopPrice: ${DEFAULT_STOP_PRICE_CENTS}n, // USD cents ($${formatUsdCents(DEFAULT_STOP_PRICE_CENTS)})
  reason: 'RSI oversold',
})`
  }
  return `import { SignalVault } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: '${vault}',
  privateKey: process.env.PRIVATE_KEY!,
})

await vault.publish({
  direction: 'LONG',
  sizeBps: 1500,
  stopPrice: ${DEFAULT_STOP_PRICE_CENTS}n, // USD cents ($${formatUsdCents(DEFAULT_STOP_PRICE_CENTS)})
  reason: 'RSI oversold',
})`
}

export function ConnectAgentPanel({ vaultAddress, publisherAddress }: ConnectAgentPanelProps) {
  const [tab, setTab] = useState<'ts' | 'js'>('ts')
  const [direction, setDirection] = useState<'1' | '-1' | '0'>('1')
  const [sizeBps, setSizeBps] = useState('1500')
  const [stopPrice, setStopPrice] = useState(DEFAULT_STOP_PRICE_CENTS)
  const [reason, setReason] = useState('Test signal from SignalVault UI')

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const snippet = buildSnippet(vaultAddress, tab)
  const stopUsdHint = formatUsdCents(stopPrice)

  function handleTestSignal() {
    writeContract({
      address: publisherAddress,
      abi: ExternalSignalPublisherABI,
      functionName: 'publish',
      args: [
        Number(direction),
        Number(sizeBps),
        BigInt(stopPrice),
        reason,
      ],
    })
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  return (
    <Card className="border-accent/20">
      <CardHeader>
        <CardTitle className="text-base">Connect your agent</CardTitle>
        <CardDescription>
          Install <code className="font-mono text-xs">signalvault-sdk</code> from npm and publish signals to your vault.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <VaultAddressCard address={vaultAddress} title="Vault address (for your agent .env)" />

        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 font-mono text-[11px] text-muted-foreground">
          npm install signalvault-sdk
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'ts' | 'js')}>
          <TabsList>
            <TabsTrigger value="ts">TypeScript</TabsTrigger>
            <TabsTrigger value="js">JavaScript</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-secondary/30 p-4 text-[11px] leading-relaxed text-foreground">
              {snippet}
            </pre>
          </TabsContent>
        </Tabs>

        <div className="space-y-4 rounded-lg border border-border/60 bg-secondary/10 p-4">
          <p className="text-sm font-medium text-foreground">Send a test signal</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Direction</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={direction}
                onChange={(e) => setDirection(e.target.value as '1' | '-1' | '0')}
              >
                <option value="1">LONG</option>
                <option value="-1">SHORT</option>
                <option value="0">FLAT</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Size (bps)</Label>
              <Input value={sizeBps} onChange={(e) => setSizeBps(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Stop price (USD cents)</Label>
              <Input value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">
                {stopUsdHint !== '—' ? `≈ $${stopUsdHint} USD` : 'Enter cents, e.g. 186000 for $1,860.00'}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </div>
          <Button onClick={handleTestSignal} disabled={isPending || isConfirming} className="w-full sm:w-auto">
            {isPending || isConfirming ? 'Confirm in wallet…' : 'Send test signal'}
          </Button>
        </div>

        <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={reset} />
      </CardContent>
    </Card>
  )
}
