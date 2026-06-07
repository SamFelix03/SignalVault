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
export const VAULT_FACTORY_ADDRESS = '0x4C6F12b2Fd56D9B227a2196137e6478692a73B21' as Address

// Demo vault deployed via factory.deployVault()
export const DEMO_VAULT_ADDRESS = '0x76695CBcB0e47a8D5af1360552d71e3950a4849E' as Address
export const DEMO_ORCHESTRATOR_ADDRESS = '0x1C2CE05330EAe2B922722213d34163371484520A' as Address
export const DEMO_MIRROR_REACTOR = '0xBaBD72AE1479C34e248a4792305FD969013383Dd' as Address
export const DEMO_STOP_REACTOR = '0xA32039f84Eb437f49Fd2F3682C48C6BA487C1ee6' as Address
export const DEMO_DRAWDOWN_GUARD = '0x56bc7a23236B898484bc3B2C1f115eBd98a52C8C' as Address
export const DEMO_EPOCH_CRON = '0x03c23E8991f9788b608f1C869b32adDCA419a70b' as Address
export const DEMO_PERFORMANCE_LEDGER = '0xE913ae3029d9F9A7c6BC08d3814D464C97A06101' as Address
export const DEMO_FEE_DISTRIBUTOR = '0x4c5Bb18079F4676B58f35b40Df33576088eBD1c2' as Address

// ── Backend API ─────────────────────────────────────────────────────
// Set NEXT_PUBLIC_API_URL directly, or just NEXT_PUBLIC_BACKEND_PORT (defaults to 3001).
const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT ?? '3001'
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${backendPort}`

// ── Agent IDs ───────────────────────────────────────────────────────
export const JSON_API_AGENT_ID = BigInt('13174292974160097713')
export const LLM_PARSE_AGENT_ID = BigInt('12875401142070969085')
export const LLM_INFER_AGENT_ID = BigInt('12847293847561029384')

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
