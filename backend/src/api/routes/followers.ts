import { Router, type Request, type Response } from 'express';
import { type Address, getAddress } from 'viem';
import { fetchFollowerPositions, fetchFollowerTrades } from '../../services/follower-trades';
import { followerVaultIndex } from '../../services/follower-vault-index';
import { redemptionWatcher } from '../../services/redemption-watcher';
import { logger } from '../../utils/logger';

const CTX = 'FollowerRoutes';
export const followerRouter = Router();

followerRouter.get('/:address/subscriptions', async (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string) as Address;
    await followerVaultIndex.syncAll();
    const subscriptions = followerVaultIndex.getSubscribedVaults(follower);
    res.json({
      follower,
      count: subscriptions.length,
      subscriptions,
      syncedAt: followerVaultIndex.getLastSyncedAt(),
    });
  } catch (err) {
    logger.error(CTX, 'Failed to get follower subscriptions', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

followerRouter.get('/:address/positions', async (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string) as Address;
    const positions = await fetchFollowerPositions(follower);
    res.json({ positions });
  } catch (err) {
    logger.error(CTX, 'Failed to get follower positions', err);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

followerRouter.get('/:address/trades', async (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string) as Address;
    const chainTrades = await fetchFollowerTrades(follower);

    const trades = chainTrades.map((t) => ({
      epoch: t.timestamp,
      direction: t.direction,
      sizeBps: 0,
      marketId: '0x0000000000000000000000000000000000000000000000000000000000000000',
      limitPrice: '0',
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      pnl: t.pnl,
      pnlPercent: t.pnlPercent,
      reasoning: t.reasoningSummary,
      reasoningHash: t.reasoningHash,
      timestamp: t.timestamp,
      txHash: '',
      vaultAddress: t.vaultAddress,
      vaultName: t.vaultName,
      size: t.size,
      source: t.source,
    }));

    res.json({ trades });
  } catch (err) {
    logger.error(CTX, 'Failed to get follower trades', err);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

followerRouter.get('/:address/claimable', async (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string) as Address;
    const claimable = await redemptionWatcher.getClaimableForFollower(follower);
    res.json({ follower, count: claimable.length, claimable });
  } catch (err) {
    logger.error(CTX, 'Failed to get claimable positions', err);
    res.status(500).json({ error: 'Failed to fetch claimable positions' });
  }
});

followerRouter.post('/:address/redeem', async (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string) as Address;
    const authorizations = req.body?.authorizations;
    if (!Array.isArray(authorizations) || authorizations.length === 0) {
      res.status(400).json({
        error: 'authorizations required',
        hint: 'Sign redeem authorizations in your wallet, then POST them here for relayer submission',
      });
      return;
    }
    const result = await redemptionWatcher.redeemForFollower(follower, authorizations);
    res.json({ follower, ...result });
  } catch (err) {
    logger.error(CTX, 'Failed to redeem positions', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to redeem positions' });
  }
});
