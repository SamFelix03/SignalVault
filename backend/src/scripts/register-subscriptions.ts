/**
 * Registers on-chain reactivity subscriptions for all reactor contracts
 * using the deployer's wallet (EOA) as the subscription owner.
 *
 * The deployer needs >= 32 STT balance (one-time requirement).
 * Run: npx tsx src/scripts/register-subscriptions.ts
 */
import {
  createPublicClient, createWalletClient, http,
  parseAbi, type Address, encodeAbiParameters, concat,
  keccak256, toBytes, toHex, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from '../config/chains';
import { VAULT_FACTORY_ADDRESS, RPC_URL, MIRROR_HANDLER_GAS_LIMIT, DEFAULT_HANDLER_GAS_LIMIT } from '../config/constants';

const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

const TOPICS = {
  SignalUpdated: keccak256(toBytes('SignalUpdated(bytes32,int8,uint16,bytes32,uint256,string,bytes32)')),
  TradeSettled: keccak256(toBytes('TradeSettled(uint256,int8,int256,uint256,uint256)')),
  DrawdownUpdated: keccak256(toBytes('DrawdownUpdated(address,uint256,uint256)')),
  EpochTick: keccak256(toBytes('EpochTick(uint64,uint64)')),
};

const factoryAbi = parseAbi([
  'function getDeploymentCount() view returns (uint256)',
  'function getDeployment(uint256) view returns (address vault, address orchestrator, address mirrorReactor, address stopReactor, address drawdownGuard, address epochCron, address performanceLedger, address feeDistributor, address strategist, uint256 deployedAt)',
]);

const ON_EVENT_SELECTOR = keccak256(toBytes('onEvent(address,bytes32[],bytes)')).slice(0, 10) as Hex;

// The subscribe function selector: keccak256("subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool))")
const SUBSCRIBE_SELECTOR = keccak256(
  toBytes('subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool))')
).slice(0, 10) as Hex;

// ABI parameter types for the SubscriptionData struct
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
    console.error('ERROR: Need at least 32 STT in deployer wallet');
    process.exit(1);
  }

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

    await registerSubscription(walletClient, publicClient, {
      name: 'MirrorReactor',
      handler: mirrorReactor,
      topic0: TOPICS.SignalUpdated,
      emitter: vault,
      gasLimit: MIRROR_HANDLER_GAS_LIMIT,
    });

    if (stopReactor !== ZERO_ADDR) {
      await registerSubscription(walletClient, publicClient, {
        name: 'StopReactor',
        handler: stopReactor,
        topic0: TOPICS.SignalUpdated,
        emitter: vault,
      });
    } else {
      console.log('  Skipping StopReactor (not deployed for event-contract vault)');
    }

    await registerSubscription(walletClient, publicClient, {
      name: 'DrawdownGuard',
      handler: drawdownGuard,
      topic0: TOPICS.DrawdownUpdated,
      emitter: performanceLedger,
    });

    await registerSubscription(walletClient, publicClient, {
      name: 'EpochCron',
      handler: epochCron,
      topic0: TOPICS.EpochTick,
      emitter: REACTIVITY_PRECOMPILE,
    });
  }

  console.log('\n✅ All subscriptions registered!');
}

async function registerSubscription(
  walletClient: any,
  publicClient: any,
  params: { name: string; handler: Address; topic0: Hex; emitter: Address; gasLimit?: number }
) {
  console.log(`  Registering ${params.name}...`);

  const gasLimit = params.gasLimit ?? DEFAULT_HANDLER_GAS_LIMIT;

  const structValue = {
    eventTopics: [params.topic0, ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32],
    origin: ZERO_ADDR,
    caller: ZERO_ADDR,
    emitter: params.emitter,
    handlerContractAddress: params.handler,
    handlerFunctionSelector: ON_EVENT_SELECTOR,
    priorityFeePerGas: 0n,
    maxFeePerGas: 20000000000n,
    gasLimit: BigInt(gasLimit),
    isGuaranteed: false,
    isCoalesced: false,
  };

  try {
    const encodedParams = encodeAbiParameters(
      [subscriptionDataType],
      [structValue as any],
    );

    const calldata = concat([SUBSCRIBE_SELECTOR as Hex, encodedParams]);

    const hash = await walletClient.sendTransaction({
      to: REACTIVITY_PRECOMPILE,
      data: calldata,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`    ✓ ${params.name} registered (tx: ${hash.slice(0, 18)}... status: ${receipt.status})`);
  } catch (err: any) {
    console.error(`    ✗ Failed: ${err.message?.slice(0, 150)}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
