import { Router, type Request, type Response } from 'express';
import { type Address, getAddress } from 'viem';
import { publicClient } from '../../config/chains';
import { vaultIndexer } from '../../services/vault-indexer';
import { StrategyVaultABI } from '../../abis/StrategyVault';
import { logger } from '../../utils/logger';

const CTX = 'FollowerRoutes';
export const followerRouter = Router();

followerRouter.get('/:address/positions', async (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string) as Address;
    const vaults = vaultIndexer.getAllVaults();
    const positions = [];

    for (const vault of vaults) {
      const config = await publicClient.readContract({
        address: vault.address,
        abi: StrategyVaultABI,
        functionName: 'getFollowerConfig',
        args: [follower],
      }) as {
        riskPct: number;
        maxPositionSize: bigint;
        maxSlippageBps: number;
        stopLossBuffer: bigint;
        active: boolean;
      };

      if (!config.active) continue;

      const signal = vault.currentSignal;
      positions.push({
        vaultAddress: vault.address,
        vaultName: vault.strategyPrompt?.slice(0, 50) || 'Strategy Vault',
        direction: signal?.direction ?? 0,
        entryPrice: signal?.stopPrice ?? '0',
        currentPnl: 0,
        pnlPercent: 0,
        stopPrice: signal?.stopPrice ?? '0',
        riskPct: config.riskPct,
        maxPositionSize: config.maxPositionSize.toString(),
      });
    }

    res.json({ positions });
  } catch (err) {
    logger.error(CTX, 'Failed to get follower positions', err);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

followerRouter.get('/:address/trades', (req: Request, res: Response) => {
  try {
    const follower = getAddress(req.params.address as string);
    const vaults = vaultIndexer.getAllVaults();
    const trades = [];

    for (const vault of vaults) {
      const vaultTrades = vaultIndexer.getVaultTrades(vault.address);
      for (const t of vaultTrades) {
        if (t.follower.toLowerCase() === follower.toLowerCase()) {
          trades.push(t);
        }
      }
    }

    res.json({ trades });
  } catch (err) {
    logger.error(CTX, 'Failed to get follower trades', err);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});
