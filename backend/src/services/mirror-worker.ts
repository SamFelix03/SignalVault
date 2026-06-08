import { type Address, encodePacked, getAddress, keccak256, parseAbi } from 'viem';
import { publicClient } from '../config/chains';
import { StrategyVaultABI } from '../abis/StrategyVault';
import { vaultIndexer } from './vault-indexer';
import { sanitizePipelineText } from '../utils/sanitize-pipeline-text';
import { followerMirrorStore, type MirrorOpenLeg, type MirrorSettledTrade } from './follower-mirror-store';
import { fetchEthUsdCents } from './mark-price';
import { logger } from '../utils/logger';
import type { DecodedSignalUpdated } from '../utils/decoder';

const CTX = 'MirrorWorker';

export type SignalMirrorEvent = DecodedSignalUpdated & { timestamp?: number };

const vaultAbi = parseAbi([
  'function getFollowers() view returns (address[])',
  'function getFollowerConfig(address) view returns ((uint16,uint256,uint16,uint256,bool))',
]);

/** Matches StrategyVault.updateSignal: keccak256(abi.encodePacked(direction, sizeBps, stopPrice, block.number)). */
export function computeOnChainSignalHash(
  direction: number,
  sizeBps: number,
  stopPrice: bigint,
  epoch: bigint,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ['int8', 'uint16', 'uint256', 'uint256'],
      [direction, sizeBps, stopPrice, epoch],
    ),
  );
}

/** Quote notional in USDso (18 decimals) — same formula as MirrorReactor. */
export function computeQuoteNotional(
  maxPositionSize: bigint,
  sizeBps: number,
  riskPct: number,
): bigint {
  return (maxPositionSize * BigInt(sizeBps) * BigInt(riskPct)) / (10_000n * 100n);
}

export function computePnlPercent(direction: number, entryCents: number, exitCents: number): number {
  if (entryCents <= 0) return 0;
  const raw = direction > 0
    ? ((exitCents - entryCents) / entryCents) * 100
    : ((entryCents - exitCents) / entryCents) * 100;
  return Math.round(raw * 100) / 100;
}

export function computePnlUsd(direction: number, entryCents: number, exitCents: number, sizeWei: bigint): number {
  const pct = computePnlPercent(direction, entryCents, exitCents) / 100;
  const notionalUsd = Number(sizeWei) / 1e18;
  return Math.round(notionalUsd * pct * 100) / 100;
}

function stopPriceToCents(stopPrice: bigint): number {
  return Number(stopPrice);
}

class MirrorWorker {
  async onSignalUpdated(event: SignalMirrorEvent): Promise<void> {
    const vaultAddress = getAddress(event.vault);
    const vault = vaultIndexer.getVault(vaultAddress);
    if (!vault) {
      logger.warn(CTX, `Unknown vault ${event.vault}, skipping mirror`);
      return;
    }

    const markCents = await fetchEthUsdCents();
    const timestamp = event.timestamp ?? Math.floor(Date.now() / 1000);
    const vaultName = vault.strategyPrompt?.slice(0, 50) || 'Strategy Vault';

    let followers: Address[];
    try {
      followers = await publicClient.readContract({
        address: event.vault,
        abi: vaultAbi,
        functionName: 'getFollowers',
      }) as Address[];
    } catch (err) {
      logger.error(CTX, `Failed to load followers for ${event.vault}`, err);
      return;
    }

    const normalizedEvent = { ...event, vault: vaultAddress };

    for (const follower of followers) {
      try {
        await this.mirrorForFollower(follower, normalizedEvent, vaultName, markCents, timestamp);
      } catch (err) {
        logger.error(CTX, `Mirror failed for ${follower}`, err);
      }
    }
  }

  private async mirrorForFollower(
    follower: Address,
    event: SignalMirrorEvent,
    vaultName: string,
    markCents: number,
    timestamp: number,
  ): Promise<void> {
    if (followerMirrorStore.wasSignalProcessed(follower, event.vault, event.signalHash)) {
      return;
    }

    const config = await publicClient.readContract({
      address: event.vault,
      abi: vaultAbi,
      functionName: 'getFollowerConfig',
      args: [follower],
    }) as readonly [number, bigint, number, bigint, boolean];

    const [riskPct, maxPositionSize, , , active] = config;
    if (!active) return;

    const openLeg = followerMirrorStore.getOpenLeg(follower, event.vault);
    if (openLeg) {
      this.settleLeg(openLeg, markCents, event.signalHash, timestamp);
    }

    if (event.direction !== 0) {
      const size = computeQuoteNotional(maxPositionSize, event.sizeBps, riskPct);
      if (size === 0n) {
        followerMirrorStore.markSignalProcessed(follower, event.vault, event.signalHash);
        return;
      }

      const leg: MirrorOpenLeg = {
        follower,
        vault: event.vault,
        vaultName,
        direction: event.direction,
        entryPriceCents: markCents,
        size: size.toString(),
        signalHash: event.signalHash,
        reasoningHash: event.reasoningHash,
        openedAt: timestamp,
        reasoningSummary: event.reasoningSummary,
        stopPriceCents: stopPriceToCents(event.stopPrice),
      };
      followerMirrorStore.setOpenLeg(leg);
      logger.info(CTX, `Opened signal-sync leg`, {
        follower,
        vault: event.vault,
        direction: event.direction,
        entryCents: markCents,
        size: leg.size,
      });
    }

    followerMirrorStore.markSignalProcessed(follower, event.vault, event.signalHash);
  }

  private settleLeg(
    leg: MirrorOpenLeg,
    exitCents: number,
    closeSignalHash: string,
    timestamp: number,
  ): void {
    const pnlPercent = computePnlPercent(leg.direction, leg.entryPriceCents, exitCents);
    const pnl = computePnlUsd(leg.direction, leg.entryPriceCents, exitCents, BigInt(leg.size));

    const trade: MirrorSettledTrade = {
      follower: leg.follower,
      vault: leg.vault,
      vaultName: leg.vaultName,
      direction: leg.direction,
      entryPriceCents: leg.entryPriceCents,
      exitPriceCents: exitCents,
      size: leg.size,
      pnl,
      pnlPercent,
      signalHash: leg.signalHash,
      reasoningHash: leg.reasoningHash,
      timestamp,
      reasoningSummary: leg.reasoningSummary,
    };

    followerMirrorStore.addSettledTrade(trade);
    followerMirrorStore.clearOpenLeg(leg.follower, leg.vault);
    logger.info(CTX, `Settled signal-sync leg`, {
      follower: leg.follower,
      vault: leg.vault,
      pnlPercent,
      closeSignalHash,
    });
  }

  /** Read on-chain signal and mirror for all followers (after pipeline completes or on poll). */
  async syncVaultSignal(vaultAddress: Address): Promise<void> {
    const signal = await publicClient.readContract({
      address: vaultAddress,
      abi: StrategyVaultABI,
      functionName: 'getCurrentSignal',
    }) as {
      direction: number;
      sizeBps: number;
      stopPrice: bigint;
      epoch: bigint;
      reasoningHash: string;
      reasoningSummary: string;
    };

    const reasoningHash = signal.reasoningHash as `0x${string}`;
    const signalHash = computeOnChainSignalHash(
      signal.direction,
      signal.sizeBps,
      signal.stopPrice,
      signal.epoch,
    );
    await this.onSignalUpdated({
      vault: vaultAddress,
      direction: signal.direction,
      sizeBps: signal.sizeBps,
      stopPrice: signal.stopPrice,
      reasoningHash,
      reasoningSummary: sanitizePipelineText(signal.reasoningSummary),
      signalHash,
      timestamp: Number(signal.epoch) || Math.floor(Date.now() / 1000),
    });
  }

  /** Open legs for subscribers when backend starts mid-signal (no prior SignalUpdated in this process). */
  async reconcileAll(): Promise<void> {
    const markCents = await fetchEthUsdCents();
    const now = Math.floor(Date.now() / 1000);

    for (const vault of vaultIndexer.getAllVaults()) {
      const signal = vault.currentSignal;
      if (!signal) continue;

      let followers: Address[];
      try {
        followers = await publicClient.readContract({
          address: vault.address,
          abi: vaultAbi,
          functionName: 'getFollowers',
        }) as Address[];
      } catch {
        continue;
      }

      for (const follower of followers) {
        const config = await publicClient.readContract({
          address: vault.address,
          abi: vaultAbi,
          functionName: 'getFollowerConfig',
          args: [follower],
        }) as readonly [number, bigint, number, bigint, boolean];

        if (!config[4]) continue;

        const reasoningHash = signal.reasoningHash as `0x${string}`;
        const signalHash = computeOnChainSignalHash(
          signal.direction,
          signal.sizeBps,
          BigInt(signal.stopPrice),
          BigInt(signal.epoch),
        );
        if (followerMirrorStore.wasSignalProcessed(follower, vault.address, signalHash)) continue;

        const existing = followerMirrorStore.getOpenLeg(follower, vault.address);
        if (existing && existing.signalHash === signalHash) continue;

        await this.onSignalUpdated({
          vault: vault.address,
          direction: signal.direction,
          sizeBps: signal.sizeBps,
          stopPrice: BigInt(signal.stopPrice),
          reasoningHash,
          reasoningSummary: signal.reasoningSummary,
          signalHash,
          timestamp: Number(signal.epoch) || now,
        });
      }
    }

    logger.info(CTX, `Reconcile complete at mark $${(markCents / 100).toFixed(2)}`);
  }
}

export const mirrorWorker = new MirrorWorker();
