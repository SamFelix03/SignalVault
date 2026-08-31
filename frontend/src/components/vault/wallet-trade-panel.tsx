'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react'
import { API_URL, MARKETS_INDEXER_URL, MARKETS_WS_RPC } from '@/lib/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type BinaryMarketRow = {
  marketId: string
  symbol: string
  yesSymbol: string
  noSymbol: string
  title: string
  status: number | null
  trading: boolean
}

type MarketsExchange = import('@somnia-chain/markets-sdk').SomniaMarkets

async function loadExchange(walletClient: unknown) {
  const [{ SomniaMarkets, SOMNIA_TESTNET_ADDRESSES }, { somniaShannon }] = await Promise.all([
    import('@somnia-chain/markets-sdk'),
    import('@somnia-chain/markets-sdk/chains'),
  ])

  return new SomniaMarkets({
    indexerUrl: MARKETS_INDEXER_URL,
    chain: somniaShannon,
    wsRpcUrl: MARKETS_WS_RPC,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    // Monorepo may hoist a second viem copy; wallet client remains valid at runtime.
    walletClient: walletClient as never,
  }) as MarketsExchange
}

interface WalletTradePanelProps {
  vaultAddress: Address
  sourceWallet: Address
}

export function WalletTradePanel({ vaultAddress, sourceWallet }: WalletTradePanelProps) {
  const { address: connected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [markets, setMarkets] = useState<BinaryMarketRow[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [amount, setAmount] = useState('5')
  const [placing, setPlacing] = useState<'up' | 'down' | null>(null)

  const walletMatches = useMemo(
    () => connected?.toLowerCase() === sourceWallet.toLowerCase(),
    [connected, sourceWallet],
  )

  const selected = markets.find((m) => m.marketId === selectedId)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingMarkets(true)
      try {
        const res = await fetch(`${API_URL}/api/markets/binary`)
        if (!res.ok) throw new Error('Failed to load markets')
        const body = (await res.json()) as { markets: BinaryMarketRow[] }
        if (cancelled) return
        const trading = body.markets.filter((m) => m.trading)
        setMarkets(trading.length > 0 ? trading : body.markets)
        if (trading[0]) setSelectedId(trading[0].marketId)
        else if (body.markets[0]) setSelectedId(body.markets[0].marketId)
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Could not load markets')
        }
      } finally {
        if (!cancelled) setLoadingMarkets(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const place = useCallback(
    async (direction: 'up' | 'down') => {
      if (!walletClient || !selected) return
      if (!walletMatches) {
        toast.error('Connect the tracked source wallet to place trades')
        return
      }

      const qty = Number(amount)
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Enter a valid contract amount')
        return
      }

      setPlacing(direction)
      try {
        const exchange = await loadExchange(walletClient)
        const symbol = direction === 'up' ? selected.yesSymbol : selected.noSymbol
        const order = await exchange.createOrder(symbol, 'market', 'buy', qty, undefined, {
          timeInForce: 'IOC',
          slippage: 0.05,
        })

        const receipt = (order.info as { receipt?: { transactionHash?: Hex } })?.receipt
        toast.success(`Order placed (${direction === 'up' ? 'YES' : 'NO'})`, {
          description: receipt?.transactionHash
            ? `Fill tx ${receipt.transactionHash.slice(0, 14)}… — backend publishes vault signal within ~15s`
            : 'Backend will pick up the fill and publish a vault signal within ~15s',
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Order failed')
      } finally {
        setPlacing(null)
      }
    },
    [amount, selected, walletClient, walletMatches],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trade Event Contracts (testnet)</CardTitle>
        <CardDescription>
          Dreamdex has no testnet UI — place orders here from your tracked wallet. The backend{' '}
          <code className="text-xs">WalletFillWatcher</code> detects fills and publishes signals to vault{' '}
          <span className="font-mono text-xs">{vaultAddress.slice(0, 10)}…</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!walletMatches && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Connect wallet <span className="font-mono">{sourceWallet}</span> to trade. Orders must come from the
            tracked source wallet.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="market">Market</Label>
          {loadingMarkets ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading markets…
            </div>
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id="market">
                <SelectValue placeholder="Select a market" />
              </SelectTrigger>
              <SelectContent>
                {markets.map((m) => (
                  <SelectItem key={m.marketId} value={m.marketId}>
                    {m.title || m.symbol}
                    {!m.trading ? ' (not trading)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Contracts (IOC market buy)</Label>
          <Input
            id="amount"
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={!selected?.trading || !walletClient || placing !== null}
            onClick={() => void place('up')}
            className="gap-2"
          >
            {placing === 'up' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            Signal UP (buy YES)
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!selected?.trading || !walletClient || placing !== null}
            onClick={() => void place('down')}
            className="gap-2"
          >
            {placing === 'down' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
            Signal DOWN (buy NO)
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Requires tUSDC approval on the Event Contracts router. First fill after watcher start is ignored (bootstrap);
          trade twice to verify end-to-end mirroring.
        </p>
      </CardContent>
    </Card>
  )
}

export { WalletTradePanel as BinaryTradePanel }
