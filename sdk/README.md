# signalvault-sdk

Publish trading signals to **custom agent** SignalVault vaults on Somnia testnet.

```bash
npm install signalvault-sdk
```

## Usage

```typescript
import { SignalVault } from 'signalvault-sdk'

const vault = new SignalVault({
  vault: process.env.VAULT_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY!,
})

await vault.publish({
  direction: 'LONG', // or 'SHORT', 'FLAT', 1, -1, 0
  sizeBps: 1500,
  stopPrice: 320000n, // cents, same as native vault signals
  reason: 'RSI oversold',
})
```

Your wallet must be an authorized publisher on the vault's `ExternalSignalPublisher` (the deployer is added automatically).

Native prompt-agent vaults are **not** supported — use this SDK only with vaults deployed via `deployCustomAgentVault`.
