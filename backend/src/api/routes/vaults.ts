import { Router, type Request, type Response } from 'express';
import { type Address, getAddress } from 'viem';
import { vaultIndexer } from '../../services/vault-indexer';
import { logger } from '../../utils/logger';

const CTX = 'VaultRoutes';
export const vaultRouter = Router();

vaultRouter.get('/', (_req: Request, res: Response) => {
  try {
    const vaults = vaultIndexer.getAllVaults();
    const serialized = vaults.map((v) => ({
      ...v,
      currentSignal: v.currentSignal ?? null,
    }));
    res.json({ vaults: serialized });
  } catch (err) {
    logger.error(CTX, 'Failed to list vaults', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

vaultRouter.get('/:address', (req: Request, res: Response) => {
  try {
    const address = getAddress(req.params.address as string) as Address;
    const vault = vaultIndexer.getVault(address);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }
    const serialized = {
      ...vault,
      currentSignal: vault.currentSignal ?? null,
    };
    res.json({ vault: serialized });
  } catch (err) {
    logger.error(CTX, 'Failed to get vault', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

vaultRouter.get('/:address/signals', (req: Request, res: Response) => {
  try {
    const address = getAddress(req.params.address as string) as Address;
    const signals = vaultIndexer.getVaultSignals(address);
    res.json({ signals });
  } catch (err) {
    logger.error(CTX, 'Failed to get signals', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

vaultRouter.get('/:address/trades', (req: Request, res: Response) => {
  try {
    const address = getAddress(req.params.address as string) as Address;
    const trades = vaultIndexer.getVaultTrades(address);
    res.json({ trades });
  } catch (err) {
    logger.error(CTX, 'Failed to get trades', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
