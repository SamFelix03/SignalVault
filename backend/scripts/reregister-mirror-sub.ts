/**
 * Re-register MirrorReactor subscription with higher handler gas (30M).
 * Unsubscribes prior 10M-gas subs owned by PRIVATE_KEY wallet for this vault's mirror.
 *
 *   npx tsx scripts/reregister-mirror-sub.ts <vault>
 */
import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  encodeAbiParameters,
  encodeFunctionData,
  concat,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import {
  DEFAULT_HANDLER_GAS_LIMIT,
  MIRROR_HANDLER_GAS_LIMIT,
  REACTIVITY_PRECOMPILE,
  RPC_URL,
} from '../src/config/constants.js'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address
const SIGNAL_UPDATED = keccak256(
  toBytes('SignalUpdated(bytes32,int8,uint16,bytes32,uint256,string,bytes32)'),
)
const ON_EVENT_SELECTOR = keccak256(toBytes('onEvent(address,bytes32[],bytes)')).slice(0, 10) as Hex
const SUBSCRIBE_SELECTOR = keccak256(
  toBytes('subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool))'),
).slice(0, 10) as Hex

const subscriptionCreated = parseAbiItem(
  'event SubscriptionCreated(uint256 indexed subscriptionId, address indexed owner, (bytes32[4] eventTopics, address origin, address caller, address emitter, address handlerContractAddress, bytes4 handlerFunctionSelector, uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit, bool isGuaranteed, bool isCoalesced) subscriptionData)',
)

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

function buildSubscribeCalldata(mirror: Address, vault: Address, gasLimit: number): Hex {
  const structValue = {
    eventTopics: [SIGNAL_UPDATED, ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32] as const,
    origin: ZERO_ADDR,
    caller: ZERO_ADDR,
    emitter: vault,
    handlerContractAddress: mirror,
    handlerFunctionSelector: ON_EVENT_SELECTOR,
    priorityFeePerGas: 0n,
    maxFeePerGas: 20_000_000_000n,
    gasLimit: BigInt(gasLimit),
    isGuaranteed: false,
    isCoalesced: false,
  }
  return concat([SUBSCRIBE_SELECTOR, encodeAbiParameters([subscriptionDataType], [structValue])])
}

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  fromBlock: bigint,
  toBlock: bigint,
  owner: Address,
) {
  const chunk = 999n
  const all: Awaited<ReturnType<typeof client.getLogs>> = []
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n
    const logs = await client.getLogs({
      address: REACTIVITY_PRECOMPILE,
      event: subscriptionCreated,
      args: { owner },
      fromBlock: start,
      toBlock: end,
    })
    all.push(...logs)
  }
  return all
}

async function main() {
  const vault = process.argv[2] as Address
  const pk = process.env.PRIVATE_KEY
  if (!vault || !pk) throw new Error('usage: reregister-mirror-sub.ts <vault>')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  const [owner, mirrorReactor] = await Promise.all([
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: vault,
      abi: parseAbi(['function mirrorReactor() view returns (address)']),
      functionName: 'mirrorReactor',
    }),
  ])

  const balance = await publicClient.getBalance({ address: account.address })
  console.log({ vault, owner, mirrorReactor, subscriber: account.address, balanceStt: Number(balance) / 1e18 })

  if (balance < 32n * 10n ** 18n) {
    throw new Error('Subscriber wallet needs >= 32 STT for reactivity subscriptions')
  }

  const latest = await publicClient.getBlockNumber()
  const fromBlock = latest > 50_000n ? latest - 50_000n : 0n
  console.log(`Scanning SubscriptionCreated logs ${fromBlock} → ${latest}…`)

  const created = await getLogsChunked(publicClient, fromBlock, latest, account.address)
  const mirrorSubs = created.filter(
    (l) =>
      l.args.subscriptionData?.handlerContractAddress?.toLowerCase() === mirrorReactor.toLowerCase() &&
      l.args.subscriptionData?.emitter?.toLowerCase() === vault.toLowerCase(),
  )

  console.log(`Found ${mirrorSubs.length} mirror subscription(s) for this vault`)
  for (const sub of mirrorSubs) {
    const gas = sub.args.subscriptionData?.gasLimit
    console.log(`  id=${sub.args.subscriptionId?.toString()} gasLimit=${gas?.toString()}`)
    if (gas !== undefined && gas < BigInt(MIRROR_HANDLER_GAS_LIMIT)) {
      const unsubData = encodeFunctionData({
        abi: parseAbi(['function unsubscribe(uint256 subscriptionId)']),
        functionName: 'unsubscribe',
        args: [sub.args.subscriptionId!],
      })
      console.log(`  Unsubscribing id ${sub.args.subscriptionId} (gas ${gas} < ${MIRROR_HANDLER_GAS_LIMIT})…`)
      const hash = await walletClient.sendTransaction({ to: REACTIVITY_PRECOMPILE, data: unsubData })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  unsubscribe tx: ${hash} status=${receipt.status}`)
    }
  }

  const subscribeData = buildSubscribeCalldata(mirrorReactor, vault, MIRROR_HANDLER_GAS_LIMIT)
  console.log(`\nSubscribing MirrorReactor with gasLimit=${MIRROR_HANDLER_GAS_LIMIT}…`)
  const subHash = await walletClient.sendTransaction({ to: REACTIVITY_PRECOMPILE, data: subscribeData })
  const subReceipt = await publicClient.waitForTransactionReceipt({ hash: subHash })
  console.log(`subscribe tx: ${subHash} status=${subReceipt.status}`)

  const newCreated = await publicClient.getLogs({
    address: REACTIVITY_PRECOMPILE,
    event: subscriptionCreated,
    args: { owner: account.address },
    fromBlock: subReceipt.blockNumber,
    toBlock: subReceipt.blockNumber,
  })
  const fresh = newCreated.filter(
    (l) =>
      l.args.subscriptionData?.handlerContractAddress?.toLowerCase() === mirrorReactor.toLowerCase() &&
      l.args.subscriptionData?.gasLimit === BigInt(MIRROR_HANDLER_GAS_LIMIT),
  )
  for (const l of fresh) {
    console.log(`✅ New subscription id=${l.args.subscriptionId?.toString()} gasLimit=${MIRROR_HANDLER_GAS_LIMIT}`)
  }

  if (fresh.length === 0) {
    console.log('⚠️ Subscribe tx succeeded but no SubscriptionCreated log found — check explorer')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
