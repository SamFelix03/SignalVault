import {
  createPublicClient,
  http,
  encodeAbiParameters,
  concat,
  keccak256,
  toBytes,
  formatEther,
  parseEther,
  type Address,
  type Hex,
} from 'viem'

const RPC = 'https://api.infra.testnet.somnia.network/'
const WALLET = '0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844' as Address
const PRECOMPILE = '0x0000000000000000000000000000000000000100' as Address
const VAULT = '0x08515F0A0740b3d76eF216c9fd28f7EF3683Ce3c' as Address

const strategyVaultAbi = [
  { type: 'function', name: 'mirrorReactor', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const ON_EVENT = keccak256(toBytes('onEvent(address,bytes32[],bytes)')).slice(0, 10) as Hex
const SUBSCRIBE = keccak256(
  toBytes('subscribe((bytes32[4],address,address,address,address,bytes4,uint64,uint64,uint64,bool,bool))'),
).slice(0, 10) as Hex
const SIGNAL_UPDATED = keccak256(
  toBytes('SignalUpdated(bytes32,int8,uint16,bytes32,uint256,string,bytes32)'),
)
const ZERO32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex
const ZERO = '0x0000000000000000000000000000000000000000' as Address

function buildSubscribeCalldata(mirror: Address, vault: Address): Hex {
  const structValue = {
    eventTopics: [SIGNAL_UPDATED, ZERO32, ZERO32, ZERO32] as const,
    origin: ZERO,
    caller: ZERO,
    emitter: vault,
    handlerContractAddress: mirror,
    handlerFunctionSelector: ON_EVENT,
    priorityFeePerGas: 0n,
    maxFeePerGas: 20_000_000_000n,
    gasLimit: 10_000_000n,
    isGuaranteed: false,
    isCoalesced: false,
  }
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
  return concat([SUBSCRIBE, encodeAbiParameters([subscriptionDataType], [structValue])])
}

async function main() {
  const client = createPublicClient({ transport: http(RPC) })
  const mirror = await client.readContract({
    address: VAULT,
    abi: strategyVaultAbi,
    functionName: 'mirrorReactor',
  })
  const balance = await client.getBalance({ address: WALLET })
  const gasPrice = await client.getGasPrice()
  const data = buildSubscribeCalldata(mirror, VAULT)

  let estimatedGas: bigint | null = null
  let simulateError: string | null = null
  try {
    estimatedGas = await client.estimateGas({ account: WALLET, to: PRECOMPILE, data })
  } catch (err) {
    simulateError = err instanceof Error ? err.message : String(err)
  }

  const txCost = estimatedGas ? estimatedGas * gasPrice : null
  const minRequired = parseEther('32')

  console.log('MirrorReactor subscription cost analysis')
  console.log('=======================================')
  console.log('Wallet:', WALLET)
  console.log('Balance:', formatEther(balance), 'STT')
  console.log('Vault:', VAULT)
  console.log('MirrorReactor:', mirror)
  console.log('Gas price:', (Number(gasPrice) / 1e9).toFixed(3), 'gwei')
  console.log('')
  console.log('Tx gas only (subscribe precompile):')
  console.log('  Estimated gas:', estimatedGas?.toString() ?? 'FAILED')
  console.log('  Est. tx cost:', txCost ? `${formatEther(txCost)} STT` : 'n/a')
  if (simulateError) console.log('  Simulate error:', simulateError.slice(0, 400))
  console.log('')
  console.log('Somnia reactivity owner minimum (documented):')
  console.log('  Required balance in subscriber wallet: 32 STT')
  console.log('  Your balance sufficient?', balance >= minRequired ? 'YES' : 'NO')
  console.log('  Shortfall:', balance >= minRequired ? '0' : `${formatEther(minRequired - balance)} STT`)
  console.log('')
  console.log('Custom-agent setup needs 2 subscriptions (Mirror + Drawdown):')
  console.log('  Min balance check applies to EACH subscribe call (wallet must hold 32 STT)')
  console.log('  Gas for 2 subs (if ~210k each):', txCost ? `~${formatEther(txCost * 2n)} STT` : 'estimate failed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
