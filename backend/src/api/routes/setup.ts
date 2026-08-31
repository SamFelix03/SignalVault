import { Router, type Request, type Response } from 'express';
import { type Address, type Hex, getAddress } from 'viem';
import {
  resolveVaultFromDeployTx,
} from '../../services/vault-setup-service';
import { vaultIndexer } from '../../services/vault-indexer';
import { followerVaultIndex } from '../../services/follower-vault-index';
import { EXPLORER_URL } from '../../config/constants';
import { logger } from '../../utils/logger';

const CTX = 'SetupRoutes';
export const setupRouter = Router();

/** Read-only: parse VaultDeployed from deploy tx and return deployment addresses. */
setupRouter.post('/resolve', async (req: Request, res: Response) => {
  try {
    const txHash = req.body?.txHash as Hex | undefined;
    if (!txHash || !txHash.startsWith('0x')) {
      res.status(400).json({ error: 'txHash is required' });
      return;
    }

    logger.info(CTX, 'POST /api/setup/resolve', { txHash });

    const deployment = await resolveVaultFromDeployTx(txHash);
    await vaultIndexer.forceIndexVault(deployment.vaultAddress);
    await followerVaultIndex.syncVault(deployment.vaultAddress);

    res.json({
      vaultAddress: deployment.vaultAddress,
      vaultId: deployment.vaultId.toString(),
      strategist: deployment.strategist,
      orchestrator: deployment.orchestrator,
      mirrorReactor: deployment.mirrorReactor,
      stopReactor: deployment.stopReactor,
      drawdownGuard: deployment.drawdownGuard,
      epochCron: deployment.epochCron,
      performanceLedger: deployment.performanceLedger,
      feeDistributor: deployment.feeDistributor,
      deployTxHash: txHash,
      explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
    });
  } catch (err) {
    logger.error(CTX, 'Failed to resolve deploy tx', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to resolve deployment',
    });
  }
});

/** Read-only: refresh backend indexer after wallet-signed setup steps. */
setupRouter.post('/:vaultAddress/index', async (req: Request, res: Response) => {
  try {
    const vaultAddress = getAddress(req.params.vaultAddress as string) as Address;
    const vault = await vaultIndexer.forceIndexVault(vaultAddress);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found in factory registry' });
      return;
    }
    await followerVaultIndex.syncVault(vaultAddress);
    res.json({ ok: true, vault });
  } catch (err) {
    logger.error(CTX, 'Failed to index vault', err);
    res.status(500).json({ error: 'Failed to index vault' });
  }
});
