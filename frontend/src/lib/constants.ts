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
export const ETH_USD_ORACLE = '0xd9132c1d762D432672493F640a63B758891B449e' as Address

// ── SignalVault Deployed Contracts (Somnia Testnet) ─────────────────
export const VAULT_FACTORY_ADDRESS = '0x533FE38d998B2B289cD7Fb0A4a968CD55173BaB9' as Address

// Demo vault deployed via factory.deployVault()
export const SHARPE_GATED_LENDING_ADDRESS = '0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97' as Address
export const DEMO_VAULT_ADDRESS = '0xf8D8682c8D7cD30aD5f7D2579060d14943E80126' as Address
export const DEMO_ORCHESTRATOR_ADDRESS = '0x3BC2afC969899ef8377a61D4e64E4180B0bf5Ac5' as Address
export const DEMO_MIRROR_REACTOR = '0x434108F91F619e9C2022A312eAf16EddB5A334a4' as Address
export const DEMO_STOP_REACTOR = '0x2e21D336fF9ED3A6B2f7bc896E25DFa01Cff16b1' as Address
export const DEMO_DRAWDOWN_GUARD = '0x7f6d6CD028C14725ad6aFA7F11e59d94411D28aB' as Address
export const DEMO_EPOCH_CRON = '0x9791fa47f9C9Ed72687f307e16aaD3e63FA6E209' as Address
export const DEMO_PERFORMANCE_LEDGER = '0xF1B258C8Cf375B0639Ead833AfE63f36cc650798' as Address
export const DEMO_FEE_DISTRIBUTOR = '0xb7d747Bb88A2EF06DfE7756eb7f15115fa1ED60f' as Address

// ── dreamDEX (Somnia Testnet) ───────────────────────────────────────
export const DREAMDEX_WETH_POOL = '0xD180195da5459C7a0DEA188ed61216ec43682b50' as Address
export const DREAMDEX_WETH_STOP_REGISTRY = '0xf822D4Cb94902d667c9650e702aA5f096cc7598F' as Address

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
