# signalvault-sdk

Publish **event-contract** signals to SignalVault vaults on Somnia testnet.

**You only need:** vault address + publisher wallet private key.

```bash
npm install signalvault-sdk
# optional — live market discovery
npm install @somnia-chain/markets-sdk
```

## Usage

```typescript
import { SignalVault, pickLiveMarket } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: process.env.VAULT_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY!,
})

const market = await pickLiveMarket({
  asset: 'ETH',
  rpcUrl: 'https://api.infra.testnet.somnia.network/',
  indexerUrl: process.env.MARKETS_INDEXER_URL!,
})

await vault.publish({
  direction: 'UP',
  sizeBps: 1500,
  marketId: market!.marketId,
  limitPrice: market!.suggestedLimitPrice,
  reason: 'RSI oversold',
})
```

## What the SDK does

1. Resolves `vault.orchestrator()` → publisher contract
2. Verifies AGENT vault + custom publisher
3. Sends `publish(direction, sizeBps, marketId, limitPrice, reason)`

## What the SDK does NOT do

- Follower subscribe / tUSDC approve (use the web UI)
- On-chain mirror execution (EventContractsRouter + MirrorReactor)
- Wallet-fill mirroring (backend relayer for WALLET vaults)
- Redemption / claim (frontend or backend watcher)
