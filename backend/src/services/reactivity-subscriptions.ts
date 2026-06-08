import {
  type Address,
  type Hex,
  encodeAbiParameters,
  concat,
  keccak256,
  toBytes,
} from 'viem';
import { publicClient, getWalletClient } from '../config/chains';
import { REACTIVITY_PRECOMPILE } from '../config/constants';
import { logger } from '../utils/logger';

const CTX = 'ReactivitySubscriptions';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

export const REACTIVITY_TOPICS = {
  SignalUpdated: keccak256(toBytes('SignalUpdated(bytes32,int8,uint16,uint256,string,bytes32)')),
  TradeSettled: keccak256(toBytes('TradeSettled(uint256,int8,int256,uint256,uint256)')),
  DrawdownUpdated: keccak256(toBytes('DrawdownUpdated(address,uint256,uint256)')),
  EpochTick: keccak256(toBytes('EpochTick(uint64,uint64)')),
} as const;

const ON_EVENT_SELECTOR = keccak256(toBytes('onEvent(address,bytes32[],bytes)')).slice(0, 10) as Hex;

const SUBSCRIBE_SELECTOR = keccak256(
  toBytes('subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool))'),
).slice(0, 10) as Hex;

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
} as const;

export interface SubscriptionTarget {
  name: string;
  handler: Address;
  topic0: Hex;
  emitter: Address;
}

export interface SubscriptionResult {
  name: string;
  txHash: Hex;
  status: 'success' | 'failed';
  error?: string;
}

export function buildVaultSubscriptionTargets(deployment: {
  vault: Address;
  mirrorReactor: Address;
  stopReactor: Address;
  drawdownGuard: Address;
  epochCron: Address;
  performanceLedger: Address;
}): SubscriptionTarget[] {
  return [
    {
      name: 'MirrorReactor',
      handler: deployment.mirrorReactor,
      topic0: REACTIVITY_TOPICS.SignalUpdated,
      emitter: deployment.vault,
    },
    {
      name: 'StopReactor',
      handler: deployment.stopReactor,
      topic0: REACTIVITY_TOPICS.SignalUpdated,
      emitter: deployment.vault,
    },
    {
      name: 'DrawdownGuard',
      handler: deployment.drawdownGuard,
      topic0: REACTIVITY_TOPICS.DrawdownUpdated,
      emitter: deployment.performanceLedger,
    },
    {
      name: 'EpochCron',
      handler: deployment.epochCron,
      topic0: REACTIVITY_TOPICS.EpochTick,
      emitter: REACTIVITY_PRECOMPILE,
    },
  ];
}

export async function registerReactivitySubscription(
  params: SubscriptionTarget,
): Promise<SubscriptionResult> {
  const walletClient = getWalletClient();

  const structValue = {
    eventTopics: [params.topic0, ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32] as const,
    origin: ZERO_ADDR,
    caller: ZERO_ADDR,
    emitter: params.emitter,
    handlerContractAddress: params.handler,
    handlerFunctionSelector: ON_EVENT_SELECTOR,
    priorityFeePerGas: 0n,
    maxFeePerGas: 20_000_000_000n,
    gasLimit: 10_000_000n,
    isGuaranteed: false,
    isCoalesced: false,
  };

  try {
    const encodedParams = encodeAbiParameters(
      [subscriptionDataType],
      [structValue],
    );

    const calldata = concat([SUBSCRIBE_SELECTOR, encodedParams]);

    const hash = await walletClient.sendTransaction({
      to: REACTIVITY_PRECOMPILE,
      data: calldata,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      return { name: params.name, txHash: hash, status: 'failed', error: 'Transaction reverted' };
    }

    logger.info(CTX, `Registered ${params.name}`, { txHash: hash });
    return { name: params.name, txHash: hash, status: 'success' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(CTX, `Failed to register ${params.name}`, err);
    return { name: params.name, txHash: '0x' as Hex, status: 'failed', error: message };
  }
}

export async function registerVaultSubscriptions(deployment: {
  vault: Address;
  mirrorReactor: Address;
  stopReactor: Address;
  drawdownGuard: Address;
  epochCron: Address;
  performanceLedger: Address;
}): Promise<SubscriptionResult[]> {
  const targets = buildVaultSubscriptionTargets(deployment);
  const results: SubscriptionResult[] = [];

  for (const target of targets) {
    results.push(await registerReactivitySubscription(target));
  }

  return results;
}
