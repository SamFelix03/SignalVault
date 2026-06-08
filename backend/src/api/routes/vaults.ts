import { Router, type Request, type Response } from 'express';
import { type Address, getAddress } from 'viem';
import { publicClient } from '../../config/chains';
import { vaultIndexer } from '../../services/vault-indexer';
import { PerformanceLedgerABI } from '../../abis/PerformanceLedger';
import { StrategyVaultABI } from '../../abis/StrategyVault';
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

vaultRouter.get('/:address/signals', async (req: Request, res: Response) => {
  try {
    const address = getAddress(req.params.address as string) as Address;
    const cached = vaultIndexer.getVaultSignals(address);

    const length = await publicClient.readContract({
      address,
      abi: StrategyVaultABI,
      functionName: 'signalHistoryLength',
    }) as bigint;

    const total = Number(length);
    if (total === 0) {
      res.json({ signals: cached });
      return;
    }

    const limit = Math.min(total, 10);
    const offset = total > 10 ? total - 10 : 0;
    const history = await publicClient.readContract({
      address,
      abi: StrategyVaultABI,
      functionName: 'getSignalHistory',
      args: [BigInt(offset), BigInt(limit)],
    }) as Array<{
      direction: number; sizeBps: number; stopPrice: bigint;
      epoch: bigint; reasoningHash: string; reasoningSummary: string;
    }>;

    const signals = history.map((s) => ({
      direction: Number(s.direction),
      sizeBps: Number(s.sizeBps),
      stopPrice: s.stopPrice.toString(),
      epoch: s.epoch.toString(),
      reasoningHash: s.reasoningHash,
      reasoningSummary: s.reasoningSummary,
    })).reverse();

    res.json({ signals });
  } catch (err) {
    logger.error(CTX, 'Failed to get signals', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

vaultRouter.get('/:address/pnl', async (req: Request, res: Response) => {
  try {
    const address = getAddress(req.params.address as string) as Address;
    const vault = vaultIndexer.getVault(address);
    if (!vault) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    const tradeCount = await publicClient.readContract({
      address: vault.performanceLedger,
      abi: PerformanceLedgerABI,
      functionName: 'getTradeCount',
    }) as bigint;

    const limit = Math.min(Number(tradeCount), 50);
    let trades: any[] = [];
    if (limit > 0) {
      const offset = Number(tradeCount) > 50 ? Number(tradeCount) - 50 : 0;
      trades = (await publicClient.readContract({
        address: vault.performanceLedger,
        abi: PerformanceLedgerABI,
        functionName: 'getTradeHistory',
        args: [BigInt(offset), BigInt(limit)],
      })) as any[];
    }

    let cumulative = 0;
    const chartData = trades.map((t) => {
      const size = Number(t.size);
      const pnlBps = size > 0 ? (Number(t.pnl) * 10000) / size : 0;
      cumulative += pnlBps;
      return {
        date: new Date(Number(t.timestamp) * 1000).toISOString().slice(0, 10),
        pnl: pnlBps,
        cumulativePnl: cumulative,
      };
    });

    res.json({
      trades: trades.map((t: any) => ({
        direction: Number(t.direction),
        entryPrice: t.entryPrice.toString(),
        exitPrice: t.exitPrice.toString(),
        pnl: Number(t.pnl) / 1e18,
        timestamp: Number(t.timestamp),
      })),
      chartData,
    });
  } catch (err) {
    logger.error(CTX, 'Failed to get PnL', err);
    res.status(500).json({ error: 'Failed to fetch PnL data' });
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
        pnlBps: t.size > 0n ? ((t.pnl * 10000n) / t.size).toString() : '0',
        settledAt: t.timestamp.toString(),
      })),
    });
  } catch (err) {
    logger.error(CTX, 'Failed to get leaderboard', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
});
