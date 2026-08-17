# signalvault-sdk

Publish trading signals to **custom agent** SignalVault vaults on Somnia testnet.

**You only need two things:** your vault address and your publisher wallet private key. No factory addresses, no deployment registry, no mirror reactor config.

```bash
npm install signalvault-sdk
```

## Usage

```typescript
import { SignalVault } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: process.env.VAULT_ADDRESS!,   // from /vault/0x... after deploy
  privateKey: process.env.PRIVATE_KEY!, // wallet authorized as publisher
})

await vault.publish({
  direction: 'LONG', // or 'SHORT', 'FLAT', 1, -1, 0
  sizeBps: 1500,
  stopPrice: 320000n, // cents, same as native vault signals
  reason: 'RSI oversold',
})
```

## What the SDK reads on-chain

Given your `vault` address, the SDK automatically:

1. Calls `vault.orchestrator()` to find the publisher contract
2. Verifies it is an external agent publisher (`isCustomPublisher()`)
3. Sends `publish(...)` on that publisher

Your wallet must already be an authorized publisher on that contract (the deployer is added automatically).

Native on-chain AI vaults are **not** supported — use a custom-agent vault address only.
