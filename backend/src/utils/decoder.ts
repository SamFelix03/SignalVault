import { decodeEventLog, getAddress, type Address, type Log } from 'viem';
import { StrategyVaultABI } from '../abis/StrategyVault';
import { PerformanceLedgerABI } from '../abis/PerformanceLedger';
import { vaultIndexer } from '../services/vault-indexer';

export interface DecodedSignalUpdated {
  vault: `0x${string}`;
  signalHash: `0x${string}`;
  direction: number;
  sizeBps: number;
  stopPrice: bigint;
  reasoningHash: `0x${string}`;
  reasoningSummary: string;
}

export interface DecodedTradeSettled {
  vault: `0x${string}`;
  follower: `0x${string}`;
  direction: number;
  entryPrice: bigint;
  exitPrice: bigint;
  pnlBps: bigint;
  signalHash: `0x${string}`;
  timestamp?: number;
}

export interface DecodedDrawdownUpdated {
  vault: `0x${string}`;
  maxDrawdownBps: bigint;
}

export function decodeSignalUpdated(log: Log): DecodedSignalUpdated {
  const decoded = decodeEventLog({
    abi: StrategyVaultABI,
    eventName: 'SignalUpdated',
    topics: log.topics,
    data: log.data,
  });
  const signalHash = (log.topics[1] ?? '0x' + '0'.repeat(64)) as `0x${string}`;
  return {
    vault: getAddress(log.address),
    signalHash,
    direction: (decoded.args as any).direction,
    sizeBps: (decoded.args as any).sizeBps,
    stopPrice: (decoded.args as any).stopPrice,
    reasoningHash: (decoded.args as any).reasoningHash,
    reasoningSummary: (decoded.args as any).reasoningSummary ?? '',
  };
}

export function decodeFollowerTradeSettled(log: Log): DecodedTradeSettled {
  const decoded = decodeEventLog({
    abi: PerformanceLedgerABI,
    eventName: 'FollowerTradeSettled',
    topics: log.topics,
    data: log.data,
  });
  const args = decoded.args as {
    follower: Address;
    vault: Address;
    direction: number;
    entryPrice: bigint;
    exitPrice: bigint;
    size: bigint;
    pnl: bigint;
    signalHash: `0x${string}`;
  };
  return {
    vault: args.vault,
    follower: args.follower,
    direction: args.direction,
    entryPrice: args.entryPrice,
    exitPrice: args.exitPrice,
    pnlBps: args.pnl,
    signalHash: args.signalHash,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

export function decodeTradeSettled(log: Log): DecodedTradeSettled {
  const decoded = decodeEventLog({
    abi: PerformanceLedgerABI,
    eventName: 'TradeSettled',
    topics: log.topics,
    data: log.data,
  });
  const args = decoded.args as {
    tradeIndex: bigint;
    direction: number;
    pnl: bigint;
    entryPrice: bigint;
    exitPrice: bigint;
  };
  const ledger = log.address as Address;
  const vault =
    vaultIndexer.getAllVaults().find((v) => v.performanceLedger.toLowerCase() === ledger.toLowerCase())
      ?.address ?? ledger;
  return {
    vault: vault as `0x${string}`,
    follower: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    direction: args.direction,
    entryPrice: args.entryPrice,
    exitPrice: args.exitPrice,
    pnlBps: args.pnl,
    signalHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
  };
}

export function decodeDrawdownUpdated(log: Log): DecodedDrawdownUpdated {
  const decoded = decodeEventLog({
    abi: PerformanceLedgerABI,
    eventName: 'DrawdownUpdated',
    topics: log.topics,
    data: log.data,
  });
  const args = decoded.args as any;
  return {
    vault: args.vault ?? (log.topics[1] ? ('0x' + log.topics[1].slice(26)) as `0x${string}` : log.address as `0x${string}`),
    maxDrawdownBps: args.maxDrawdownBps ?? BigInt(0),
  };
}
