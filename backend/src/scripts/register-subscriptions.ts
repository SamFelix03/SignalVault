/**
 * Registers on-chain reactivity subscriptions for all reactor contracts
 * using the deployer's wallet (EOA) as the subscription owner.
 *
 * The deployer needs >= 32 STT balance (one-time requirement).
 * Run: npx tsx src/scripts/register-subscriptions.ts
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Address, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from '../config/chains';
import {
  VAULT_FACTORY_ADDRESS,
  RPC_URL,
  WS_RPC_URL,
} from '../config/constants';

const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address;

import { keccak256, toBytes } from 'viem';

const TOPICS = {
  SignalUpdated: keccak256(toBytes('SignalUpdated(bytes32,int8,uint16,uint256,string,bytes32)')),
  TradeSettled: keccak256(toBytes('TradeSettled(uint256,int8,int256,uint256,uint256)')),
  DrawdownUpdated: keccak256(toBytes('DrawdownUpdated(address,uint256,uint256)')),
  EpochTick: keccak256(toBytes('EpochTick(uint64,uint64)')),
};

const subscribeAbi = parseAbi([
  'function subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool)) returns (uint256)',
]);

const factoryAbi = parseAbi([
  'function getDeploymentCount() view returns (uint256)',
  'function getDeployment(uint256) view returns (address vault, address orchestrator, address mirrorReactor, address stopReactor, address drawdownGuard, address epochCron, address performanceLedger, address feeDistributor, address strategist, uint256 deployedAt)',
]);

// SomniaEventHandler.onEvent.selector = bytes4(keccak256("onEvent(address,bytes32[],bytes)"))
const ON_EVENT_SELECTOR = keccak256(toBytes('onEvent(address,bytes32[],bytes)')).slice(0, 10) as `0x${string}`;

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not set in env');

  const account = privateKeyToAccount(pk as `0x${string}`);

  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: somniaTestnet,
    transport: http(RPC_URL),
  });

  console.log('Deployer:', account.address);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', (Number(balance) / 1e18).toFixed(2), 'STT');

  if (balance < 32n * 10n ** 18n) {
    console.error('ERROR: Need at least 32 STT in deployer wallet for reactivity subscriptions');
    process.exit(1);
  }

  // Get all vault deployments
  const count = await publicClient.readContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getDeploymentCount',
  });

  console.log(`Found ${count} vault deployment(s)`);

  for (let i = 0n; i < count; i++) {
    const dep = await publicClient.readContract({
      address: VAULT_FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'getDeployment',
      args: [i],
    });

    const [vault, , mirrorReactor, stopReactor, drawdownGuard, epochCron, performanceLedger] = dep;

    console.log(`\n--- Vault #${i}: ${vault} ---`);

    // 1. MirrorReactor: subscribe to SignalUpdated from vault
    await registerSubscription(walletClient, publicClient, {
      name: 'MirrorReactor',
      handler: mirrorReactor,
      topic0: TOPICS.SignalUpdated,
      emitter: vault,
    });

    // 2. StopReactor: subscribe to SignalUpdated from vault
    await registerSubscription(walletClient, publicClient, {
      name: 'StopReactor',
      handler: stopReactor,
      topic0: TOPICS.SignalUpdated,
      emitter: vault,
    });

    // 3. DrawdownGuard: subscribe to DrawdownUpdated from performanceLedger
    await registerSubscription(walletClient, publicClient, {
      name: 'DrawdownGuard',
      handler: drawdownGuard,
      topic0: TOPICS.DrawdownUpdated,
      emitter: performanceLedger,
    });

    // 4. EpochCron: subscribe to EpochTick from reactivity precompile
    await registerSubscription(walletClient, publicClient, {
      name: 'EpochCron',
      handler: epochCron,
      topic0: TOPICS.EpochTick,
      emitter: REACTIVITY_PRECOMPILE,
    });
  }

  console.log('\nAll subscriptions registered!');
}

async function registerSubscription(
  walletClient: any,
  publicClient: any,
  params: {
    name: string;
    handler: Address;
    topic0: `0x${string}`;
    emitter: Address;
  }
) {
  console.log(`  Registering ${params.name} subscription...`);
  console.log(`    Handler: ${params.handler}`);
  console.log(`    Emitter: ${params.emitter}`);
  console.log(`    Topic0: ${params.topic0.slice(0, 18)}...`);

  // Build the SubscriptionData struct
  // struct: (bytes32[4] eventTopics, address origin, address caller, address emitter, address handler, bytes4 selector, uint64 priority, uint64 maxFee, uint64 gasLimit, bool isGuaranteed, bool isCoalesced)
  const subscriptionData = {
    eventTopics: [
      params.topic0,
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    ] as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`],
    origin: '0x0000000000000000000000000000000000000000' as Address,
    caller: '0x0000000000000000000000000000000000000000' as Address,
    emitter: params.emitter,
    handlerContractAddress: params.handler,
    handlerFunctionSelector: ON_EVENT_SELECTOR as `0x${string}`,
    priorityFeePerGas: 0n,
    maxFeePerGas: 20000000000n, // 20 gwei
    gasLimit: 10000000n, // 10M
    isGuaranteed: false,
    isCoalesced: false,
  };

  try {
    const subscribeData = encodeFunctionData({
      abi: subscribeAbi,
      functionName: 'subscribe',
      args: [subscriptionData as any],
    });

    const hash = await walletClient.sendTransaction({
      to: REACTIVITY_PRECOMPILE,
      data: subscribeData,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`    ✓ Subscription registered (tx: ${hash.slice(0, 18)}..., status: ${receipt.status})`);
  } catch (err: any) {
    console.error(`    ✗ Failed: ${err.message?.slice(0, 100)}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
