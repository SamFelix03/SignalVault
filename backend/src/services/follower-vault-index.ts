import { type Address, getAddress, parseAbi } from 'viem';
import { publicClient } from '../config/chains';
import { vaultIndexer, type VaultInfo } from './vault-indexer';
import { logger } from '../utils/logger';

const CTX = 'FollowerVaultIndex';

const vaultAbi = parseAbi([
  'function getFollowers() view returns (address[])',
  'function getFollowerConfig(address) view returns ((uint16,uint256,uint16,uint256,bool))',
]);

export interface SubscribedVaultInfo {
  address: Address;
  vaultId: number;
  strategyPrompt: string;
  displayName: string;
  performanceFeeBps: number;
  strategist: Address;
  orchestrator: Address;
  mirrorReactor: Address;
  currentSignal?: VaultInfo['currentSignal'];
}

/** Reverse index: follower → subscribed vaults with cached strategy metadata. */
class FollowerVaultIndex {
  /** follower (lowercase) → Set of vault addresses (checksummed) */
  private followerToVaults = new Map<string, Set<Address>>();
  /** vault (lowercase) → active follower addresses */
  private vaultToFollowers = new Map<string, Address[]>();
  private lastSyncedAt = 0;

  /** Sync followers for a single vault (call after index or subscription change). */
  async syncVault(vaultAddress: Address): Promise<void> {
    const vault = getAddress(vaultAddress);
    const vaultKey = vault.toLowerCase();

    // Remove stale vault references before rebuilding
    const previousFollowers = this.vaultToFollowers.get(vaultKey) ?? [];
    for (const follower of previousFollowers) {
      const set = this.followerToVaults.get(follower.toLowerCase());
      if (set) {
        set.delete(vault);
        if (set.size === 0) this.followerToVaults.delete(follower.toLowerCase());
      }
    }

    let followers: Address[];
    try {
      followers = await publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'getFollowers',
      }) as Address[];
    } catch (err) {
      logger.warn(CTX, `Failed to sync followers for ${vault}`, err);
      this.vaultToFollowers.set(vaultKey, []);
      return;
    }

    const activeFollowers: Address[] = [];
    for (const follower of followers) {
      try {
        const config = await publicClient.readContract({
          address: vault,
          abi: vaultAbi,
          functionName: 'getFollowerConfig',
          args: [follower],
        }) as readonly [number, bigint, number, bigint, boolean];

        if (!config[4]) continue;
        const checksummed = getAddress(follower);
        activeFollowers.push(checksummed);

        const followerKey = checksummed.toLowerCase();
        const set = this.followerToVaults.get(followerKey) ?? new Set();
        set.add(vault);
        this.followerToVaults.set(followerKey, set);
      } catch {
        // skip inactive follower
      }
    }

    this.vaultToFollowers.set(vaultKey, activeFollowers);
    this.lastSyncedAt = Date.now();
  }

  /** Batch sync all indexed vaults — one RPC round per vault for followers. */
  async syncAll(): Promise<void> {
    const vaults = vaultIndexer.getAllVaults();
    await Promise.all(vaults.map((v) => this.syncVault(v.address)));
    logger.info(CTX, `Synced subscriptions for ${vaults.length} vault(s)`);
  }

  /** Get subscribed vaults for a follower with strategy metadata from indexer cache (no extra strategy RPCs). */
  getSubscribedVaults(follower: Address): SubscribedVaultInfo[] {
    const followerKey = follower.toLowerCase();
    const vaultAddrs = this.followerToVaults.get(followerKey);
    if (!vaultAddrs || vaultAddrs.size === 0) return [];

    const results: SubscribedVaultInfo[] = [];
    for (const vaultAddr of vaultAddrs) {
      const info = this.buildSubscribedVaultInfo(vaultAddr);
      if (info) results.push(info);
    }
    return results;
  }

  /** Cached display name for a vault — avoids repeated strategy reads in mirror worker. */
  getVaultDisplayName(vaultAddress: Address): string {
    const vault = vaultIndexer.getVault(vaultAddress);
    if (!vault) return 'Strategy Vault';
    return vault.strategyPrompt?.slice(0, 50) || 'Strategy Vault';
  }

  getVaultStrategy(vaultAddress: Address): string | undefined {
    return vaultIndexer.getVault(vaultAddress)?.strategyPrompt;
  }

  getFollowersForVault(vaultAddress: Address): Address[] {
    return this.vaultToFollowers.get(vaultAddress.toLowerCase()) ?? [];
  }

  getLastSyncedAt(): number {
    return this.lastSyncedAt;
  }

  private buildSubscribedVaultInfo(vaultAddress: Address): SubscribedVaultInfo | undefined {
    const vault = vaultIndexer.getVault(vaultAddress);
    if (!vault) return undefined;

    return {
      address: vault.address,
      vaultId: vault.vaultId,
      strategyPrompt: vault.strategyPrompt,
      displayName: vault.strategyPrompt?.slice(0, 50) || 'Strategy Vault',
      performanceFeeBps: vault.performanceFeeBps,
      strategist: vault.strategist,
      orchestrator: vault.orchestrator,
      mirrorReactor: vault.mirrorReactor,
      currentSignal: vault.currentSignal,
    };
  }
}

export const followerVaultIndex = new FollowerVaultIndex();
