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
export const VAULT_FACTORY_ADDRESS = '0x68491CE1f69E8B0DFC25a1F6DE51A1a15825E612' as Address
export const LEGACY_VAULT_FACTORY_ADDRESS = '0x4e4D20D7bc954FDe4C447a21255B9eD39cfAb938' as Address

// Demo vault deployed via factory.deployVault()
export const SHARPE_GATED_LENDING_ADDRESS = '0xc8F4E595f3C4ad57682ED48C52C3467EA67dBD97' as Address
export const DEMO_VAULT_ADDRESS = '0x6DE77BacB732A060549465999f895A1f4FdE3158' as Address
export const DEMO_ORCHESTRATOR_ADDRESS = '0x96D2D03b901d6b416795a726c28D975f115a51b5' as Address
export const DEMO_MIRROR_REACTOR = '0x5a213B28E1Cf0cC1Fc8E0E1Bc9f6cf0F5Fe4a066' as Address
export const DEMO_STOP_REACTOR = '0xA5F46aF29A00398A024E2c7155e3Dc7892a5CEF1' as Address
export const DEMO_DRAWDOWN_GUARD = '0xa3569d967bB70E04160286301d4A0130a852d431' as Address
export const DEMO_EPOCH_CRON = '0xeD5d2e89B7f92dae60E41d9f5239c22a869eAf94' as Address
export const DEMO_PERFORMANCE_LEDGER = '0x92997bc11aEA5437b51275e75259f0DA1058A2fF' as Address
export const DEMO_FEE_DISTRIBUTOR = '0xBAB99BF7610626A16fAbDe5c522DaD8bAfDaADc0' as Address

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
