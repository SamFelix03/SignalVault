import { type Address } from 'viem';

export interface MirrorOpenLeg {
  follower: Address;
  vault: Address;
  vaultName: string;
  direction: number;
  entryPriceCents: number;
  size: string;
  signalHash: string;
  reasoningHash: string;
  openedAt: number;
  reasoningSummary: string;
  stopPriceCents: number;
}

export interface MirrorSettledTrade {
  follower: Address;
  vault: Address;
  vaultName: string;
  direction: number;
  entryPriceCents: number;
  exitPriceCents: number;
  size: string;
  pnl: number;
  pnlPercent: number;
  signalHash: string;
  reasoningHash: string;
  timestamp: number;
  reasoningSummary: string;
}

function legKey(follower: Address, vault: Address): string {
  return `${follower.toLowerCase()}:${vault.toLowerCase()}`;
}

class FollowerMirrorStore {
  private openLegs = new Map<string, MirrorOpenLeg>();
  private trades: MirrorSettledTrade[] = [];
  private lastProcessedSignal = new Map<string, string>();

  wasSignalProcessed(follower: Address, vault: Address, signalHash: string): boolean {
    return this.lastProcessedSignal.get(legKey(follower, vault)) === signalHash;
  }

  markSignalProcessed(follower: Address, vault: Address, signalHash: string): void {
    this.lastProcessedSignal.set(legKey(follower, vault), signalHash);
  }

  getOpenLeg(follower: Address, vault: Address): MirrorOpenLeg | undefined {
    return this.openLegs.get(legKey(follower, vault));
  }

  setOpenLeg(leg: MirrorOpenLeg): void {
    this.openLegs.set(legKey(leg.follower, leg.vault), leg);
  }

  clearOpenLeg(follower: Address, vault: Address): void {
    this.openLegs.delete(legKey(follower, vault));
  }

  addSettledTrade(trade: MirrorSettledTrade): void {
    this.trades.push(trade);
    if (this.trades.length > 500) {
      this.trades = this.trades.slice(-500);
    }
  }

  getOpenLegsForFollower(follower: Address): MirrorOpenLeg[] {
    const key = follower.toLowerCase();
    return [...this.openLegs.values()].filter((l) => l.follower.toLowerCase() === key);
  }

  getTradesForFollower(follower: Address): MirrorSettledTrade[] {
    const key = follower.toLowerCase();
    return this.trades
      .filter((t) => t.follower.toLowerCase() === key)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}

export const followerMirrorStore = new FollowerMirrorStore();
