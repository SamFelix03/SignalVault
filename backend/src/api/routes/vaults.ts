import { Router, type Request, type Response } from 'express';
import { type Address, getAddress } from 'viem';
import { publicClient } from '../../config/chains';
import { vaultIndexer } from '../../services/vault-indexer';
import { PerformanceLedgerABI } from '../../abis/PerformanceLedger';
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

vaultRouter.get('/:address/leaderboard', async (req: Request, res: Response) => {
  try {
    const address = getAddress(req.params.address as string) as Address;
    const vault = vaultIndexer.getVault(address);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    const ledgerAddress = vault.performanceLedger;

    const [statsResult, winRate, sharpeApprox, tradeCount] = await Promise.all([
      publicClient.readContract({
        address: ledgerAddress,
        abi: PerformanceLedgerABI,
        functionName: 'stats',
      }) as Promise<{
        totalPnl: bigint; totalTrades: bigint; winCount: bigint; lossCount: bigint;
        highWaterMark: bigint; maxDrawdownBps: bigint; currentDrawdownBps: bigint;
        sumReturns: bigint; sumSquaredReturns: bigint; lastSettledEpoch: bigint;
      }>,
      publicClient.readContract({
        address: ledgerAddress,
        abi: PerformanceLedgerABI,
        functionName: 'getWinRate',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: ledgerAddress,
        abi: PerformanceLedgerABI,
        functionName: 'getSharpeApprox',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: ledgerAddress,
        abi: PerformanceLedgerABI,
        functionName: 'getTradeCount',
      }) as Promise<bigint>,
    ]);

    const limit = Math.min(Number(tradeCount), 50);
    let tradeHistory: any[] = [];
    if (limit > 0) {
      const offset = Number(tradeCount) > 50 ? Number(tradeCount) - 50 : 0;
      tradeHistory = (await publicClient.readContract({
        address: ledgerAddress,
        abi: PerformanceLedgerABI,
        functionName: 'getTradeHistory',
        args: [BigInt(offset), BigInt(limit)],
      })) as any[];
    }

    res.json({
      vault: address,
      totalPnl: statsResult.totalPnl.toString(),
      totalTrades: statsResult.totalTrades.toString(),
      winCount: statsResult.winCount.toString(),
      lossCount: statsResult.lossCount.toString(),
      winRate: winRate.toString(),
      sharpeApprox: sharpeApprox.toString(),
      maxDrawdownBps: statsResult.maxDrawdownBps.toString(),
      currentDrawdownBps: statsResult.currentDrawdownBps.toString(),
      highWaterMark: statsResult.highWaterMark.toString(),
      lastSettledEpoch: statsResult.lastSettledEpoch.toString(),
      tradeHistory: tradeHistory.map((t: any) => ({
        direction: Number(t.direction),
        entryPrice: t.entryPrice.toString(),
        exitPrice: t.exitPrice.toString(),
        pnlBps: t.pnlBps.toString(),
        settledAt: t.settledAt.toString(),
        signalHash: t.signalHash,
      })),
    });
  } catch (err) {
    logger.error(CTX, 'Failed to get leaderboard', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
});
