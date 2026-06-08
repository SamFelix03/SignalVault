import { type Address } from 'viem';
import { followerMirrorStore } from './follower-mirror-store';
import { computePnlPercent, computePnlUsd } from './mirror-worker';
import { fetchEthUsdCents } from './mark-price';

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
  reasoningSummary: string;
  timestamp: number;
  source: 'signal-sync';
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
  source: 'signal-sync';
}

function centsToUsd(cents: number): number {
  return cents / 100;
}

/** Settled trades from the signal-sync mirror store. */
export async function fetchFollowerTrades(follower: Address): Promise<FollowerTradeDto[]> {
  return followerMirrorStore.getTradesForFollower(follower).map((t) => ({
    vaultAddress: t.vault,
    vaultName: t.vaultName,
    direction: t.direction,
    entryPrice: String(t.entryPriceCents),
    exitPrice: String(t.exitPriceCents),
    size: t.size,
    pnl: t.pnl,
    pnlPercent: t.pnlPercent,
    reasoningHash: t.reasoningHash || t.signalHash,
    reasoningSummary: t.reasoningSummary,
    timestamp: t.timestamp,
    source: 'signal-sync' as const,
  }));
}

/** Open signal-sync legs for subscribed vaults. */
export async function fetchFollowerPositions(follower: Address): Promise<FollowerPositionDto[]> {
  const markCents = await fetchEthUsdCents();
  const openLegs = followerMirrorStore.getOpenLegsForFollower(follower);

  return openLegs.map((leg) => {
    const pnlPercent = computePnlPercent(leg.direction, leg.entryPriceCents, markCents);
    const pnl = computePnlUsd(leg.direction, leg.entryPriceCents, markCents, BigInt(leg.size));

    return {
      vaultAddress: leg.vault,
      vaultName: leg.vaultName,
      direction: leg.direction,
      entryPrice: centsToUsd(leg.entryPriceCents),
      currentPnl: pnl,
      pnlPercent,
      stopPrice: centsToUsd(leg.stopPriceCents),
      size: leg.size,
      source: 'signal-sync' as const,
    };
  });
}
