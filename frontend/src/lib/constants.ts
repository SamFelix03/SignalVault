import { type Address } from 'viem'

// ── Somnia Testnet Network ──────────────────────────────────────────
export const CHAIN_ID = 50312
export const RPC_URL = 'https://api.infra.testnet.somnia.network/'
export const WS_RPC_URL = 'wss://api.infra.testnet.somnia.network/ws'
export const EXPLORER_URL = 'https://shannon-explorer.somnia.network'

// ── Somnia Platform Contracts ───────────────────────────────────────
export const AGENT_REQUESTER_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776' as Address
export const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address

// ── Protofire Oracles (Somnia testnet) ──────────────────────────────
export const BTC_USD_ORACLE = '0x8CeE6c58b8CbD8afdEaF14e6fCA0876765e161fE' as Address
export const ETH_USD_ORACLE = '0xd9132c1d762D432672493F640a63B758891B449e' as Address

// ── SignalVault Deployed Contracts (Somnia Testnet) ─────────────────
export const VAULT_FACTORY_ADDRESS = '0x8A95eB38AeF1b0d64Ed92a51c3aA176590e1B4e0' as Address

// Demo vault deployed via factory.deployVault()
export const SHARPE_GATED_LENDING_ADDRESS = '0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97' as Address
export const DEMO_VAULT_ADDRESS = '0x5A50a57453043DC3743fFBF988deF4aFc78409Cb' as Address
export const DEMO_ORCHESTRATOR_ADDRESS = '0xb5c8ae83b7D37A5f456F7093E22ab01BD9D0A3ce' as Address
export const DEMO_MIRROR_REACTOR = '0x57228C6b3A41715FF528d99a9015755143A85aA4' as Address
export const DEMO_STOP_REACTOR = '0xee99dF4D5aC1e44235E807b855c496Df43aD0EfA' as Address
export const DEMO_DRAWDOWN_GUARD = '0x970CB55Bfe0cEf8b53feC9F2D8D54b3209543817' as Address
export const DEMO_EPOCH_CRON = '0xcD335E6e59E3E213D225dfA9eea2a82Ea3087114' as Address
export const DEMO_PERFORMANCE_LEDGER = '0x6C9B101bA3661f3F58387b478cCCC9A548c54531' as Address
export const DEMO_FEE_DISTRIBUTOR = '0x2246C447E6Ad5C65B22e07626e7aD3597c997B63' as Address

// ── dreamDEX (Somnia Testnet) ───────────────────────────────────────
export const DREAMDEX_WBTC_POOL = '0x3605f28aA7C50e7441211e77Cb0762d49539326C' as Address
export const DREAMDEX_WBTC_STOP_REGISTRY = '0x53d5B2b0791b3992a1F3b5e0b0277Ee2e08B7aaD' as Address

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
