import { type Address } from 'viem'

// ── Somnia Testnet Network ──────────────────────────────────────────
export const CHAIN_ID = 50312
export const RPC_URL = 'https://api.infra.testnet.somnia.network/'
export const WS_RPC_URL = 'wss://api.infra.testnet.somnia.network/ws'
export const EXPLORER_URL = 'https://shannon-explorer.somnia.network'

// ── Somnia Platform Contracts ───────────────────────────────────────
export const AGENT_REQUESTER_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776' as Address
export const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address

// ── Protofire Oracles ───────────────────────────────────────────────
export const BTC_USD_ORACLE = '0xa57d637618252669fD859B1F4C7bE6F52Bef67ed' as Address
export const ETH_USD_ORACLE = '0xeC25a820A6F194118ef8274216a7F225Da019526' as Address

// ── SignalVault Deployed Contracts (Somnia Testnet) ─────────────────
export const VAULT_FACTORY_ADDRESS = '0xEC4c2EbDC3ead82C842c8932d7956Dca49e68C0E' as Address

// First vault deployed via factory.deployVault() — fully on-chain EIP-1167 clones
export const DEMO_VAULT_ADDRESS = '0x95262AeaD21e5c98B92aC366640f816f5F0d62b5' as Address
export const DEMO_ORCHESTRATOR_ADDRESS = '0xA62F01B0De722F0b97f4D789C75E7d152DE0B0F1' as Address

// ── Backend API ─────────────────────────────────────────────────────
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// ── Agent IDs ───────────────────────────────────────────────────────
export const JSON_API_AGENT_ID = BigInt('13174292974160097713')
export const LLM_PARSE_AGENT_ID = BigInt('13174292974160097713')
export const LLM_INFER_AGENT_ID = BigInt('13174292974160097713')

// ── Agent Costs (STT) ──────────────────────────────────────────────
export const JSON_FETCH_COST = 0.03
export const LLM_PARSE_COST = 0.10
export const LLM_INFER_COST = 0.07
export const SUBCOMMITTEE_SIZE = 3

// ── Data Stream Schemas ─────────────────────────────────────────────
export const SIGNAL_SCHEMA =
  'uint64 timestamp, address vault, int8 direction, uint16 sizeBps, uint256 stopPrice, bytes32 reasoningHash, string reasoning'

export const PNL_SCHEMA =
  'uint64 timestamp, address vault, address follower, int8 direction, uint256 entryPrice, uint256 exitPrice, int256 pnlBps, bytes32 signalHash'

export const VAULT_META_SCHEMA =
  'uint64 timestamp, address vault, address strategist, string name, uint16 performanceFeeBps, uint256 followerCount, int256 sharpe30dBps, uint256 maxDrawdownBps'
