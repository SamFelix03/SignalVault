import { type Address, type Hex, getAddress } from 'viem';
import { followerVaultIndex } from './follower-vault-index';
import { createMarketsExchange } from './markets-exchange';
import { logger } from '../utils/logger';

const CTX = 'RedemptionWatcher';
const SCAN_MS = 60_000;

export interface ClaimablePositionView {
  marketId: string;
  pool: string;
  outcomeIdx: 0 | 1;
  amount: string;
  estPayout: string;
  status: string;
}

export interface RedeemAuthorizationInput {
  owner: Address;
  operatorId: number;
  venueId: Hex;
  marketId: Hex;
  outcomeIdx: 0 | 1;
  amount: string;
  nonce: string;
  deadline: string;
  signature: Hex;
}

class RedemptionWatcher {
  private claimableByFollower = new Map<string, ClaimablePositionView[]>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    logger.info(CTX, 'Starting redemption watcher');
    await this.scanAllFollowers().catch((err) => logger.error(CTX, 'Initial scan failed', err));
    this.scanTimer = setInterval(() => {
      this.scanAllFollowers().catch((err) => logger.error(CTX, 'Scan failed', err));
    }, SCAN_MS);
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    logger.info(CTX, 'Redemption watcher stopped');
  }

  async getClaimableForFollower(follower: Address, opts?: { refresh?: boolean }): Promise<ClaimablePositionView[]> {
    const key = follower.toLowerCase();
    if (!opts?.refresh) {
      const cached = this.claimableByFollower.get(key);
      if (cached) return cached;
    }

    const fresh = await this.scanFollower(follower);
    this.claimableByFollower.set(key, fresh);
    return fresh;
  }

  /**
   * Submit pre-signed redeem authorizations via the backend relayer (gas sponsor).
   * The follower signs authorizations in the wallet; payout still goes to the follower.
   */
  async redeemForFollower(
    follower: Address,
    authorizations: RedeemAuthorizationInput[],
  ): Promise<{ redeemed: number; txHashes: string[]; message: string }> {
    if (!authorizations?.length) {
      throw new Error('authorizations required — sign redeem intents in your wallet first');
    }

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      throw new Error('RELAYER_PRIVATE_KEY not configured on backend');
    }

    const exchange = await createMarketsExchange({ privateKey: relayerKey });
    const trader = exchange.trader;
    const txHashes: string[] = [];

    for (const auth of authorizations) {
      if (getAddress(auth.owner) !== getAddress(follower)) {
        throw new Error(`authorization owner ${auth.owner} does not match follower ${follower}`);
      }

      const result = await trader.redeemFor({
        authorization: {
          owner: getAddress(auth.owner),
          operatorId: auth.operatorId,
          venueId: auth.venueId,
          marketId: auth.marketId,
          outcomeIdx: auth.outcomeIdx,
          amount: BigInt(auth.amount),
          nonce: BigInt(auth.nonce),
          deadline: BigInt(auth.deadline),
          signature: auth.signature,
        },
      });

      const hash = result.receipt?.transactionHash ?? result.hash;
      if (hash) txHashes.push(hash);
    }

    this.claimableByFollower.delete(follower.toLowerCase());

    return {
      redeemed: txHashes.length,
      txHashes,
      message: `Submitted ${txHashes.length} redemption(s) for ${follower}`,
    };
  }

  private async scanAllFollowers(): Promise<void> {
    await followerVaultIndex.syncAll();
    const followers = followerVaultIndex.getAllFollowers();
    if (followers.length === 0) return;

    for (const follower of followers) {
      try {
        const fresh = await this.scanFollower(follower);
        this.claimableByFollower.set(follower.toLowerCase(), fresh);
      } catch (err) {
        logger.error(CTX, `Failed to scan claimable for ${follower}`, err);
      }
    }
  }

  private async scanFollower(follower: Address): Promise<ClaimablePositionView[]> {
    const exchange = await createMarketsExchange();
    const claimable = await exchange.client.getClaimable(follower);

    return claimable.map((p) => ({
      marketId: p.marketId,
      pool: p.pool,
      outcomeIdx: p.outcomeIdx,
      amount: p.amount.toString(),
      estPayout: p.estPayout.toString(),
      status: p.status,
    }));
  }
}

export const redemptionWatcher = new RedemptionWatcher();
