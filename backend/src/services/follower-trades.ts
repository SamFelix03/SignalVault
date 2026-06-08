import { type Address } from 'viem';
import { publicClient } from '../config/chains';
import { PerformanceLedgerABI } from '../abis/PerformanceLedger';
import { MirrorReactorABI } from '../abis/MirrorReactor';
import { DreamDexAdapterABI } from '../abis/DreamDexAdapter';
import { StrategyVaultABI } from '../abis/StrategyVault';
import { vaultIndexer } from './vault-indexer';

export interface FollowerTradeDto {
  vaultAddress: string;
  vaultName: string;
  direction: number;
  entryPrice: string;
  exitPrice: string;
  size: string;
  pnl: number;
  pnlPercent: number;
  reasoningHash: string;
  timestamp: number;
}

export interface FollowerPositionDto {
  vaultAddress: string;
  vaultName: string;
  direction: number;
  entryPrice: number;
  currentPnl: number;
  pnlPercent: number;
  stopPrice: number;
  size: string;
}

function poolPriceToUsd(raw: bigint): number {
  const n = Number(raw);
  if (n === 0) return 0;
  if (n > 1e15) return n / 1e14;
  if (n > 1e6) return n / 100;
  return n;
}

function centsToUsd(cents: bigint | string): number {
  return Number(cents) / 100;
}

function pnlPercentFromTrade(pnl: bigint, size: bigint): number {
  const s = Number(size);
  if (s === 0) return 0;
  return (Number(pnl) * 10000) / s / 100;
}

/** Read settled follower trades from each vault's PerformanceLedger on-chain. */
export async function fetchFollowerTrades(follower: Address): Promise<FollowerTradeDto[]> {
  const vaults = vaultIndexer.getAllVaults();
  const trades: FollowerTradeDto[] = [];

  for (const vault of vaults) {
    try {
      const count = await publicClient.readContract({
        address: vault.performanceLedger,
        abi: PerformanceLedgerABI,
        functionName: 'getFollowerTradeCount',
        args: [follower],
      }) as bigint;

      if (count === 0n) continue;

      const offset = count > 50n ? count - 50n : 0n;
      const history = await publicClient.readContract({
        address: vault.performanceLedger,
        abi: PerformanceLedgerABI,
        functionName: 'getFollowerTradeHistory',
        args: [follower, offset, 50n],
      }) as Array<{
        direction: number;
        entryPrice: bigint;
        exitPrice: bigint;
        size: bigint;
        pnl: bigint;
        signalHash: string;
        timestamp: bigint;
      }>;

      for (const t of history) {
        trades.push({
          vaultAddress: vault.address,
          vaultName: vault.strategyPrompt?.slice(0, 50) || 'Strategy Vault',
          direction: Number(t.direction),
          entryPrice: t.entryPrice.toString(),
          exitPrice: t.exitPrice.toString(),
          size: t.size.toString(),
          pnl: Number(t.pnl) / 1e18,
          pnlPercent: pnlPercentFromTrade(t.pnl, t.size),
          reasoningHash: t.signalHash,
          timestamp: Number(t.timestamp),
        });
      }
    } catch {
      // Ledger may not expose follower history on older deployments
    }
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

/** Open mirror legs + subscribed vaults awaiting first fill. */
export async function fetchFollowerPositions(follower: Address): Promise<FollowerPositionDto[]> {
  const vaults = vaultIndexer.getAllVaults();
  const positions: FollowerPositionDto[] = [];

  for (const vault of vaults) {
    try {
      const config = await publicClient.readContract({
        address: vault.address,
        abi: StrategyVaultABI,
        functionName: 'getFollowerConfig',
        args: [follower],
      }) as { active: boolean };

      if (!config.active) continue;

      const signal = vault.currentSignal;
      const stopCents = signal?.stopPrice ? BigInt(signal.stopPrice) : 0n;

      let direction = signal?.direction ?? 0;
      let entryUsd = 0;
      let pnlPercent = 0;
      let size = '0';

      try {
        const openLeg = await publicClient.readContract({
          address: vault.mirrorReactor,
          abi: MirrorReactorABI,
          functionName: 'followerOpenLegs',
          args: [follower],
        }) as [number, bigint, bigint, string];

        const [legDir, entryPrice, legSize] = openLeg;
        if (Number(legSize) > 0) {
          direction = Number(legDir);
          entryUsd = poolPriceToUsd(entryPrice);
          size = legSize.toString();

          const dexAddr = await publicClient.readContract({
            address: vault.mirrorReactor,
            abi: MirrorReactorABI,
            functionName: 'dex',
          }) as Address;

          const mark = await publicClient.readContract({
            address: dexAddr,
            abi: DreamDexAdapterABI,
            functionName: 'getMarkPrice',
          }) as bigint;

          const markUsd = poolPriceToUsd(mark);
          if (markUsd > 0 && entryUsd > 0) {
            pnlPercent = direction > 0
              ? ((markUsd - entryUsd) / entryUsd) * 100
              : ((entryUsd - markUsd) / entryUsd) * 100;
          }
        }
      } catch {
        // Mirror reactor may be legacy
      }

      if (entryUsd === 0 && direction !== 0) {
        entryUsd = centsToUsd(stopCents);
      }

      positions.push({
        vaultAddress: vault.address,
        vaultName: vault.strategyPrompt?.slice(0, 50) || 'Strategy Vault',
        direction,
        entryPrice: entryUsd,
        currentPnl: 0,
        pnlPercent,
        stopPrice: centsToUsd(stopCents),
        size,
      });
    } catch {
      // skip
    }
  }

  return positions;
}
