'use client'

import { useState } from 'react'
import { type Address, type Hex } from 'viem'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ExternalSignalPublisherABI } from '@/abis/ExternalSignalPublisher'
import { encodeLimitPrice } from '@/lib/markets-client'
import { TUSDC_DECIMALS } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TxStatus } from '@/components/common/tx-status'
import { VaultAddressCard } from '@/components/deploy/vault-address-card'
import { formatLimitPrice } from '@/lib/utils'

interface ConnectAgentPanelProps {
  vaultAddress: Address
  publisherAddress: Address
}

/** Example ETH binary market id — replace with a live market from markets-sdk. */
const DEFAULT_MARKET_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
const DEFAULT_LIMIT_PROB = 0.45
const DEFAULT_LIMIT_PRICE = encodeLimitPrice(DEFAULT_LIMIT_PROB, TUSDC_DECIMALS)

function buildSnippet(vault: string, tab: 'ts' | 'js'): string {
  const limitHint = formatLimitPrice(DEFAULT_LIMIT_PRICE)
  if (tab === 'js') {
    return `import { SignalVault, pickLiveMarket } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: '${vault}',
  privateKey: process.env.PRIVATE_KEY,
})

const market = await pickLiveMarket({
  asset: 'ETH',
  rpcUrl: process.env.RPC_URL,
  indexerUrl: process.env.MARKETS_INDEXER_URL,
})

await vault.publish({
  direction: 'UP',
  sizeBps: 1500,
  marketId: market.marketId,
  limitPrice: market.suggestedLimitPrice,
  reason: 'RSI oversold',
})`
  }
  return `import { SignalVault, pickLiveMarket } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: '${vault}',
  privateKey: process.env.PRIVATE_KEY!,
})

const market = await pickLiveMarket({
  asset: 'ETH',
  rpcUrl: process.env.RPC_URL!,
  indexerUrl: process.env.MARKETS_INDEXER_URL!,
})!

await vault.publish({
  direction: 'UP',
  sizeBps: 1500,
  marketId: market.marketId,
  limitPrice: market.suggestedLimitPrice,
  reason: 'RSI oversold',
})`
}

export function ConnectAgentPanel({ vaultAddress, publisherAddress }: ConnectAgentPanelProps) {
  const [tab, setTab] = useState<'ts' | 'js'>('ts')
  const [direction, setDirection] = useState<'1' | '-1' | '0'>('1')
  const [sizeBps, setSizeBps] = useState('1500')
  const [marketId, setMarketId] = useState<string>(DEFAULT_MARKET_ID)
  const [limitPrice, setLimitPrice] = useState(String(DEFAULT_LIMIT_PRICE))
  const [reason, setReason] = useState('Test signal from SignalVault UI')

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const snippet = buildSnippet(vaultAddress, tab)
  const limitHint = formatLimitPrice(limitPrice)

  function handleTestSignal() {
    writeContract({
      address: publisherAddress,
      abi: ExternalSignalPublisherABI,
      functionName: 'publish',
      args: [
        Number(direction),
        Number(sizeBps),
        marketId as Hex,
        BigInt(limitPrice),
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
          Install <code className="font-mono text-xs">signalvault-sdk</code> and publish event-contract signals
          with <code className="font-mono text-xs">marketId</code> + <code className="font-mono text-xs">limitPrice</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <VaultAddressCard address={vaultAddress} title="Vault address (for your agent .env)" />

        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 font-mono text-[11px] text-muted-foreground">
          npm install signalvault-sdk @somnia-chain/markets-sdk
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
                <option value="1">UP</option>
                <option value="-1">DOWN</option>
                <option value="0">FLAT</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Size (bps)</Label>
              <Input value={sizeBps} onChange={(e) => setSizeBps(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Market ID (bytes32)</Label>
              <Input value={marketId} onChange={(e) => setMarketId(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Limit price (scaled)</Label>
              <Input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">
                {limitHint !== '—' ? `≈ ${limitHint} Up probability` : `Example: ${DEFAULT_LIMIT_PRICE} ≈ ${formatLimitPrice(DEFAULT_LIMIT_PRICE)}`}
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
