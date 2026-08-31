import dotenv from 'dotenv';
dotenv.config({ override: true });

import { type Address } from 'viem';

// ── Somnia Testnet Network ──────────────────────────────────────────
export const CHAIN_ID = 50312;
export const RPC_URL = process.env.RPC_URL || 'https://api.infra.testnet.somnia.network/';
export const WS_RPC_URL = process.env.WS_RPC_URL || 'wss://api.infra.testnet.somnia.network/ws';
export const EXPLORER_URL = 'https://shannon-explorer.somnia.network';

// ── Somnia Platform Contracts ───────────────────────────────────────
export const AGENT_REQUESTER_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776' as Address;
export const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address;

/** Default Somnia reactivity handler gas (non-mirror subscriptions). */
export const DEFAULT_HANDLER_GAS_LIMIT = 10_000_000;
/** Perp mirror subscriptions — PerpRouter v3 needs ~22M gas per callback. */
export const MIRROR_HANDLER_GAS_LIMIT = 30_000_000;

// ── Protofire Oracles (Somnia testnet) ──────────────────────────────
export const ETH_USD_ORACLE = '0xd9132c1d762D432672493F640a63B758891B449e' as Address;

// ── SignalVault Deployed Contracts (Somnia Testnet) ─────────────────
export const VAULT_FACTORY_ADDRESS = (process.env.VAULT_FACTORY_ADDRESS || '0x14ac542754707570A5924aF77e978Af97ab52FFF') as Address;
export const LEGACY_VAULT_FACTORY_ADDRESS = (process.env.LEGACY_VAULT_FACTORY_ADDRESS || '0x9A4f07DE4Bb41F4792a397Bc1ef35Bed60484101') as Address;
export const EXTRA_VAULT_FACTORY_ADDRESSES = (process.env.EXTRA_VAULT_FACTORY_ADDRESSES || '0xf0e1E3012DE65F388bc68cf587858C2d738dE0a3,0xDB8529BEc20D34322849eE63cD5D8D02eF23d76C,0xbde6Cab60d8Dc35D03a33Fc3429b681310E6331D,0x173A9804394041E6299db8962A4325756D0bbF83,0x68491CE1f69E8B0DFC25a1F6DE51A1a15825E612,0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) as Address[];
export const SHARPE_GATED_LENDING_ADDRESS = (process.env.SHARPE_GATED_LENDING_ADDRESS || '0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97') as Address;
export const DEMO_VAULT_ADDRESS = (process.env.DEMO_VAULT_ADDRESS || '0x6DE77BacB732A060549465999f895A1f4FdE3158') as Address;
export const DEMO_ORCHESTRATOR_ADDRESS = (process.env.DEMO_ORCHESTRATOR_ADDRESS || '0x96D2D03b901d6b416795a726c28D975f115a51b5') as Address;
export const DEMO_MIRROR_REACTOR = (process.env.DEMO_MIRROR_REACTOR || '0x5a213B28E1Cf0cC1Fc8E0E1Bc9f6cf0F5Fe4a066') as Address;
export const DEMO_PERFORMANCE_LEDGER = (process.env.DEMO_PERFORMANCE_LEDGER || '0x92997bc11aEA5437b51275e75259f0DA1058A2fF') as Address;
export const PERFORMANCE_LEDGER_ADDRESS = (process.env.PERFORMANCE_LEDGER_ADDRESS || DEMO_PERFORMANCE_LEDGER) as Address;

// ── dreamDEX Event Contracts (Somnia Testnet) ───────────────────────
export const BINARY_MARKETS_MODULE = '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address;
export const TESTNET_TUSDC = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address;
export const MARKETS_INDEXER_URL =
  process.env.MARKETS_INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql';

// ── dreamDEX legacy spot (Somnia Testnet) ───────────────────────────
export const DREAMDEX_WETH_POOL = '0xD180195da5459C7a0DEA188ed61216ec43682b50' as Address;
export const DREAMDEX_WETH_STOP_REGISTRY = '0xf822D4Cb94902d667c9650e702aA5f096cc7598F' as Address;

// ── Agent IDs ───────────────────────────────────────────────────────
export const JSON_API_AGENT_ID = 13174292974160097713n;
export const LLM_PARSE_AGENT_ID = 12875401142070969085n;
export const LLM_INFER_AGENT_ID = 12847293847561029384n;

// ── Agent Costs (STT) ──────────────────────────────────────────────
export const JSON_FETCH_COST = 0.03;
export const LLM_PARSE_COST = 0.10;
export const LLM_INFER_COST = 0.07;
export const SUBCOMMITTEE_SIZE = 3;

/** Must match AgentOrchestrator.PIPELINE_TIMEOUT on-chain (seconds) */
export const PIPELINE_TIMEOUT_SEC = 90;

// ── Data Stream Schemas ─────────────────────────────────────────────
export const SIGNAL_SCHEMA =
  'uint64 timestamp, address vault, int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, bytes32 reasoningHash, string reasoning';

export const PNL_SCHEMA =
  'uint64 timestamp, address vault, address follower, int8 direction, uint256 entryPrice, uint256 exitPrice, int256 pnlBps, bytes32 signalHash';

export const VAULT_META_SCHEMA =
  'uint64 timestamp, address vault, address strategist, string name, uint16 performanceFeeBps, uint256 followerCount, int256 sharpe30dBps, uint256 maxDrawdownBps';

export const SCHEMA_NAMES = {
  signal: 'SignalVault.Signal',
  pnl: 'SignalVault.PnL',
  vaultMeta: 'SignalVault.VaultMeta',
} as const;
