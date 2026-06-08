import { Router, type Request, type Response } from 'express';
import { type Address, getAddress } from 'viem';
import { publicClient } from '../../config/chains';
import { SHARPE_GATED_LENDING_ADDRESS } from '../../config/constants';
import { vaultIndexer } from '../../services/vault-indexer';
import { logger } from '../../utils/logger';

const SharpeGatedLendingABI = [
  {
    type: 'function',
    name: 'borrowRateBps',
    inputs: [{ name: 'performanceLedger', type: 'address' }],
    outputs: [
      { name: 'rateBps', type: 'uint256' },
      { name: 'sharpe', type: 'int256' },
      { name: 'eligible', type: 'bool' },
    ],
    stateMutability: 'view',
  },
] as const;

const CTX = 'ComposabilityRoutes';
export const composabilityRouter = Router();

composabilityRouter.get('/:vaultAddress', async (req: Request, res: Response) => {
  try {
    const vaultAddress = getAddress(req.params.vaultAddress as string) as Address;
    const vault = vaultIndexer.getVault(vaultAddress);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    if (!SHARPE_GATED_LENDING_ADDRESS) {
      res.status(503).json({ error: 'SharpeGatedLending not deployed' });
      return;
    }

    const [rateBps, sharpe, eligible] = await publicClient.readContract({
      address: SHARPE_GATED_LENDING_ADDRESS,
      abi: SharpeGatedLendingABI,
      functionName: 'borrowRateBps',
      args: [vault.performanceLedger],
    }) as [bigint, bigint, boolean];

    res.json({
      vault: vaultAddress,
      performanceLedger: vault.performanceLedger,
      reader: SHARPE_GATED_LENDING_ADDRESS,
      baseRateBps: 500,
      discountBps: eligible ? 50 : 0,
      effectiveRateBps: Number(rateBps),
      sharpeApprox: sharpe.toString(),
      eligible,
      eligibleThreshold: '1500',
    });
  } catch (err) {
    logger.error(CTX, 'Failed to read composability rate', err);
    res.status(500).json({ error: 'Failed to read borrow rate' });
  }
});
