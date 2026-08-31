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

type PerpMarketRow = {
  pool: string
  symbol: string
  base: string
  markPrice: number | null
  minLot: number
  quoteDecimals: number
  trading: boolean
}

type MarketsExchange = import('@somnia-chain/markets-sdk').SomniaMarkets

const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

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
    walletClient: walletClient as never,
  }) as MarketsExchange
}

interface PerpTradePanelProps {
  vaultAddress: Address
  sourceWallet: Address
}

export function PerpTradePanel({ vaultAddress, sourceWallet }: PerpTradePanelProps) {
  const { address: connected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [markets, setMarkets] = useState<PerpMarketRow[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [selectedPool, setSelectedPool] = useState('')
  const [qty, setQty] = useState('1')
  const [leverage, setLeverage] = useState('10')
  const [marginDeposit, setMarginDeposit] = useState('5')
  const [busy, setBusy] = useState(false)

  const walletMismatch =
    connected && sourceWallet && connected.toLowerCase() !== sourceWallet.toLowerCase()

  const selected = useMemo(
    () => markets.find((m) => m.pool === selectedPool),
    [markets, selectedPool],
  )

  useEffect(() => {
    fetch(`${API_URL}/api/markets/perps`)
      .then((r) => r.json())
      .then((body: { markets?: PerpMarketRow[] }) => {
        const rows = body.markets ?? []
        setMarkets(rows)
        if (rows[0]) setSelectedPool(rows[0].pool)
      })
      .catch(() => toast.error('Failed to load perp markets'))
      .finally(() => setLoadingMarkets(false))
  }, [])

  const ensureFunding = useCallback(
    async (exchange: MarketsExchange) => {
      const lev = Number(leverage) || 10
      await exchange.trader.setPerpLeverage({
        pool: selectedPool as Address,
        leverageX: lev,
      })
      const dep = Number(marginDeposit)
      if (dep > 0) {
        await exchange.depositMargin(selected!.symbol, dep)
      }
    },
    [leverage, marginDeposit, selected, selectedPool],
  )

  const trade = useCallback(
    async (side: 'buy' | 'sell') => {
      if (!walletClient || !selected) return
      if (walletMismatch) {
        toast.error('Connect the tracked source wallet to trade')
        return
      }
      setBusy(true)
      try {
        const exchange = await loadExchange(walletClient)
        await ensureFunding(exchange)
        const lot = Number(qty) || selected.minLot
        await exchange.createOrder(selected.symbol, 'market', side, lot, undefined, {
          timeInForce: 'IOC',
          slippage: 0.05,
        })
        toast.success(`Perp ${side === 'buy' ? 'LONG' : 'SHORT'} submitted — watcher will publish signal`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Trade failed')
      } finally {
        setBusy(false)
      }
    },
    [walletClient, selected, walletMismatch, ensureFunding, qty],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade Perps (testnet)</CardTitle>
        <CardDescription>
          LONG/SHORT on dreamDEX perps. Fund with USDso (swap STT on SOMI/USDso if needed). Fills on{' '}
          <span className="font-mono text-xs">{sourceWallet.slice(0, 10)}…</span> are mirrored to vault{' '}
          <span className="font-mono text-xs">{vaultAddress.slice(0, 10)}…</span> within ~15s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {walletMismatch && (
          <p className="text-xs text-amber-500">
            Connected wallet does not match tracked source wallet — switch wallet to trade.
          </p>
        )}
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground">
          Margin: USDso via MarginBank ({MARGIN_BANK.slice(0, 10)}…). tUSDC faucet does not fund perps.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Perp market</Label>
            <Select value={selectedPool} onValueChange={setSelectedPool} disabled={loadingMarkets}>
              <SelectTrigger>
                <SelectValue placeholder={loadingMarkets ? 'Loading…' : 'Select pool'} />
              </SelectTrigger>
              <SelectContent>
                {markets.map((m) => (
                  <SelectItem key={m.pool} value={m.pool}>
                    {m.symbol} {m.markPrice != null ? `@ $${m.markPrice.toFixed(4)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantity (min lot {selected?.minLot ?? 1})</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={selected?.minLot} />
          </div>
          <div className="space-y-2">
            <Label>Max leverage</Label>
            <Input value={leverage} onChange={(e) => setLeverage(e.target.value)} type="number" min={1} max={50} />
          </div>
          <div className="space-y-2">
            <Label>Deposit margin (USDso)</Label>
            <Input value={marginDeposit} onChange={(e) => setMarginDeposit(e.target.value)} type="number" min={0} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !selected} onClick={() => trade('buy')}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUp className="mr-2 h-4 w-4" />}
            Signal LONG
          </Button>
          <Button variant="secondary" disabled={busy || !selected} onClick={() => trade('sell')}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDown className="mr-2 h-4 w-4" />}
            Signal SHORT
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
