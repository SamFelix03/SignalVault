import {
  type Address,
  type Hex,
  encodeAbiParameters,
  concat,
  keccak256,
  toBytes,
} from 'viem'
import { REACTIVITY_PRECOMPILE } from '@/lib/constants'
import type { VaultSourceType } from '@/types/vault'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address

export const REACTIVITY_TOPICS = {
  SignalUpdated: keccak256(
    toBytes('SignalUpdated(bytes32,int8,uint16,bytes32,uint256,string,bytes32)'),
  ),
  TradeSettled: keccak256(toBytes('TradeSettled(uint256,int8,int256,uint256,uint256)')),
  DrawdownUpdated: keccak256(toBytes('DrawdownUpdated(address,uint256,uint256)')),
  EpochTick: keccak256(toBytes('EpochTick(uint64,uint64)')),
} as const

/** Default Somnia reactivity handler gas (non-mirror subscriptions). */
export const DEFAULT_HANDLER_GAS_LIMIT = 10_000_000
/** Perp mirror subscriptions — PerpRouter v3 needs ~22M gas per callback. */
export const MIRROR_HANDLER_GAS_LIMIT = 30_000_000

const ON_EVENT_SELECTOR = keccak256(toBytes('onEvent(address,bytes32[],bytes)')).slice(0, 10) as Hex

const SUBSCRIBE_SELECTOR = keccak256(
  toBytes('subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool))'),
).slice(0, 10) as Hex

const subscriptionDataType = {
  type: 'tuple',
  components: [
    { name: 'eventTopics', type: 'bytes32[4]' },
    { name: 'origin', type: 'address' },
    { name: 'caller', type: 'address' },
    { name: 'emitter', type: 'address' },
    { name: 'handlerContractAddress', type: 'address' },
    { name: 'handlerFunctionSelector', type: 'bytes4' },
    { name: 'priorityFeePerGas', type: 'uint64' },
    { name: 'maxFeePerGas', type: 'uint64' },
    { name: 'gasLimit', type: 'uint64' },
    { name: 'isGuaranteed', type: 'bool' },
    { name: 'isCoalesced', type: 'bool' },
  ],
} as const

export interface SubscriptionTarget {
  name: string
  handler: Address
  topic0: Hex
  emitter: Address
}

export function buildVaultSubscriptionTargets(
  deployment: {
    vault: Address
    mirrorReactor: Address
    stopReactor: Address
    drawdownGuard: Address
    epochCron: Address
    performanceLedger: Address
  },
  opts?: { sourceType?: VaultSourceType },
): SubscriptionTarget[] {
  const sourceType = opts?.sourceType ?? 'agent'
  const targets: SubscriptionTarget[] = [
    {
      name: 'MirrorReactor',
      handler: deployment.mirrorReactor,
      topic0: REACTIVITY_TOPICS.SignalUpdated,
      emitter: deployment.vault,
    },
    {
      name: 'DrawdownGuard',
      handler: deployment.drawdownGuard,
      topic0: REACTIVITY_TOPICS.DrawdownUpdated,
      emitter: deployment.performanceLedger,
    },
  ]

  // Event-contract vaults skip StopReactor; wallet vaults also skip EpochCron.
  if (sourceType === 'agent' && deployment.epochCron !== ZERO_ADDR) {
    targets.push({
      name: 'EpochCron',
      handler: deployment.epochCron,
      topic0: REACTIVITY_TOPICS.EpochTick,
      emitter: REACTIVITY_PRECOMPILE,
    })
  }

  return targets
}

export function encodeReactivitySubscriptionCalldata(
  params: SubscriptionTarget,
  gasLimit = params.name === 'MirrorReactor' ? MIRROR_HANDLER_GAS_LIMIT : DEFAULT_HANDLER_GAS_LIMIT,
): Hex {
  const structValue = {
    eventTopics: [params.topic0, ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32] as const,
    origin: ZERO_ADDR,
    caller: ZERO_ADDR,
    emitter: params.emitter,
    handlerContractAddress: params.handler,
    handlerFunctionSelector: ON_EVENT_SELECTOR,
    priorityFeePerGas: BigInt(0),
    maxFeePerGas: BigInt(20_000_000_000),
    gasLimit: BigInt(gasLimit),
    isGuaranteed: false,
    isCoalesced: false,
  }

  const encodedParams = encodeAbiParameters([subscriptionDataType], [structValue])
  return concat([SUBSCRIBE_SELECTOR, encodedParams])
}
