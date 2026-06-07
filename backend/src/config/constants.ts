import { type Address } from 'viem';

// ── Somnia Testnet Network ──────────────────────────────────────────
export const CHAIN_ID = 50312;
export const RPC_URL = process.env.RPC_URL || 'https://api.infra.testnet.somnia.network/';
export const WS_RPC_URL = process.env.WS_RPC_URL || 'wss://api.infra.testnet.somnia.network/ws';
export const EXPLORER_URL = 'https://shannon-explorer.somnia.network';

// ── Somnia Platform Contracts ───────────────────────────────────────
export const AGENT_REQUESTER_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776' as Address;
export const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address;

// ── Protofire Oracles ───────────────────────────────────────────────
export const BTC_USD_ORACLE = '0xa57d637618252669fD859B1F4C7bE6F52Bef67ed' as Address;
export const ETH_USD_ORACLE = '0xeC25a820A6F194118ef8274216a7F225Da019526' as Address;

// ── SignalVault Deployed Contracts (Somnia Testnet) ─────────────────
export const VAULT_FACTORY_ADDRESS = (process.env.VAULT_FACTORY_ADDRESS || '0x443dC5DaC0421845F9FC0e226Dcc0B053e3527C6') as Address;
export const DEMO_VAULT_ADDRESS = '0x6db10d71aEd66ea2DA9674b950d73025Cf8FdEB2' as Address;
export const DEMO_ORCHESTRATOR_ADDRESS = '0xD13e76197C8905bDf20EA4EE32c3A023e6b501cD' as Address;
export const DEMO_MIRROR_REACTOR = '0xD75835f6400823d4858aaDF7780B29D86985a600' as Address;
export const DEMO_PERFORMANCE_LEDGER = '0x6b0E88cdc6bCD373C85537f5cd828B392501c623' as Address;
export const PERFORMANCE_LEDGER_ADDRESS = (process.env.PERFORMANCE_LEDGER_ADDRESS || '0x6b0E88cdc6bCD373C85537f5cd828B392501c623') as Address;

// ── Agent IDs ───────────────────────────────────────────────────────
export const JSON_API_AGENT_ID = 13174292974160097713n;
export const LLM_PARSE_AGENT_ID = 12875401142070969085n;
export const LLM_INFER_AGENT_ID = 12847293847561029384n;

// ── Agent Costs (STT) ──────────────────────────────────────────────
export const JSON_FETCH_COST = 0.03;
export const LLM_PARSE_COST = 0.10;
export const LLM_INFER_COST = 0.07;
export const SUBCOMMITTEE_SIZE = 3;

// ── Data Stream Schemas ─────────────────────────────────────────────
export const SIGNAL_SCHEMA =
  'uint64 timestamp, address vault, int8 direction, uint16 sizeBps, uint256 stopPrice, bytes32 reasoningHash, string reasoning';

export const PNL_SCHEMA =
  'uint64 timestamp, address vault, address follower, int8 direction, uint256 entryPrice, uint256 exitPrice, int256 pnlBps, bytes32 signalHash';

export const VAULT_META_SCHEMA =
  'uint64 timestamp, address vault, address strategist, string name, uint16 performanceFeeBps, uint256 followerCount, int256 sharpe30dBps, uint256 maxDrawdownBps';

export const SCHEMA_NAMES = {
  signal: 'SignalVault.Signal',
  pnl: 'SignalVault.PnL',
  vaultMeta: 'SignalVault.VaultMeta',
} as const;
