import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Address,
  encodeAbiParameters,
  getContractAddress,
  getAddress,
  keccak256,
  concatHex,
  type Hex,
} from 'viem'
import { publicClient } from '../config/chains'

export const TESTNET_MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

/** Latest PerpRouter.ROUTER_VERSION — mirrors fail on slippage without tick alignment below this. */
export const PERP_ROUTER_VERSION = 4

const perpRouterAbi = [
  {
    type: 'function',
    name: 'predictMirrorWallet',
    inputs: [{ name: 'follower', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'marginBank',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ROUTER_VERSION',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const vaultAbi = [
  {
    type: 'function',
    name: 'eventRouter',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'mirrorReactor',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'instrumentType',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

function contractsRoot(): string {
  return join(__dirname, '../../../contracts')
}

function loadCreationBytecode(contractName: string): Hex {
  const path = join(
    contractsRoot(),
    `out/${contractName}.sol/${contractName}.json`,
  )
  if (!existsSync(path)) {
    throw new Error(
      `Contract artifact missing: ${path}. Run forge build in contracts/.`,
    )
  }
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as {
    bytecode: { object: string }
  }
  return artifact.bytecode.object as Hex
}

/** CREATE2 mirror wallet — matches PerpRouter.predictMirrorWallet. */
export function predictMirrorWalletOffChain(
  perpRouter: Address,
  follower: Address,
  marginBank: Address = TESTNET_MARGIN_BANK,
): Address {
  const creationCode = loadCreationBytecode('FollowerMirrorWallet')
  const initCode = concatHex([
    creationCode,
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
      ],
      [getAddress(follower), getAddress(perpRouter), getAddress(marginBank)],
    ),
  ])
  const salt = keccak256(encodeAbiParameters([{ type: 'address' }], [getAddress(follower)]))
  return getContractAddress({
    bytecode: initCode,
    from: getAddress(perpRouter),
    opcode: 'CREATE2',
    salt,
  })
}

export async function resolveMirrorWallet(
  vault: Address,
  follower: Address,
): Promise<{ mirrorWallet: Address; perpRouter: Address }> {
  const perpRouter = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: 'eventRouter',
  })

  try {
    const onChain = await publicClient.readContract({
      address: perpRouter,
      abi: perpRouterAbi,
      functionName: 'predictMirrorWallet',
      args: [follower],
    })
    return { mirrorWallet: onChain, perpRouter }
  } catch {
    let marginBank = TESTNET_MARGIN_BANK
    try {
      marginBank = await publicClient.readContract({
        address: perpRouter,
        abi: perpRouterAbi,
        functionName: 'marginBank',
      })
    } catch {
      // legacy router — use testnet default
    }
    return {
      mirrorWallet: predictMirrorWalletOffChain(perpRouter, follower, marginBank),
      perpRouter,
    }
  }
}

const mirrorReactorAbi = [
  {
    type: 'function',
    name: 'subscriptionId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export async function perpRouterNeedsUpgrade(vault: Address): Promise<{
  isPerp: boolean
  needsUpgrade: boolean
  perpRouter: Address
  mirrorReactor: Address
  marginBank: Address
  deployBytecode: Hex | null
}> {
  const [instrument, perpRouter, mirrorReactor] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'instrumentType' }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'eventRouter' }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
  ])

  const isPerp = instrument === 1
  if (!isPerp) {
    return {
      isPerp: false,
      needsUpgrade: false,
      perpRouter,
      mirrorReactor,
      marginBank: TESTNET_MARGIN_BANK,
      deployBytecode: null,
    }
  }

  let hasMirrorWallet = false
  try {
    await publicClient.readContract({
      address: perpRouter,
      abi: perpRouterAbi,
      functionName: 'predictMirrorWallet',
      args: ['0x0000000000000000000000000000000000000001'],
    })
    hasMirrorWallet = true
  } catch {
    hasMirrorWallet = false
  }

  let routerVersion = 0n
  try {
    routerVersion = await publicClient.readContract({
      address: perpRouter,
      abi: perpRouterAbi,
      functionName: 'ROUTER_VERSION',
    })
  } catch {
    routerVersion = 0n
  }

  let marginBank = TESTNET_MARGIN_BANK
  try {
    marginBank = await publicClient.readContract({
      address: perpRouter,
      abi: perpRouterAbi,
      functionName: 'marginBank',
    })
  } catch {
    // use default
  }

  const needsUpgrade = !hasMirrorWallet || routerVersion < BigInt(PERP_ROUTER_VERSION)
  const deployBytecode = needsUpgrade ? loadCreationBytecode('PerpRouter') : null

  return {
    isPerp: true,
    needsUpgrade,
    perpRouter,
    mirrorReactor,
    marginBank,
    deployBytecode,
  }
}

/** On-chain requirements before perp mirrors can execute for subscribers. */
export async function getPerpMirrorReadiness(vault: Address): Promise<{
  isPerp: boolean
  mirrorsReady: boolean
  needsUpgrade: boolean
  mirrorSubscriptionRegistered: boolean
  perpRouter: Address
  mirrorReactor: Address
  marginBank: Address
  deployBytecode: Hex | null
  blockers: string[]
}> {
  const router = await perpRouterNeedsUpgrade(vault)
  if (!router.isPerp) {
    return {
      isPerp: false,
      mirrorsReady: true,
      needsUpgrade: false,
      mirrorSubscriptionRegistered: true,
      perpRouter: router.perpRouter,
      mirrorReactor: router.mirrorReactor,
      marginBank: router.marginBank,
      deployBytecode: null,
      blockers: [],
    }
  }

  // MirrorReactor.subscriptionId is only set by registerSubscription() on the contract.
  // The deploy wizard registers via the Somnia reactivity precompile (wallet-owned subs),
  // which does not update that field — so we must not treat subscriptionId === 0 as a blocker.
  let contractSubscriptionId = 0n
  try {
    contractSubscriptionId = await publicClient.readContract({
      address: router.mirrorReactor,
      abi: mirrorReactorAbi,
      functionName: 'subscriptionId',
    })
  } catch {
    contractSubscriptionId = 0n
  }

  const blockers: string[] = []
  if (router.needsUpgrade) {
    blockers.push('Vault owner must deploy PerpRouter v2 (tick-aligned slippage).')
  }

  return {
    isPerp: true,
    mirrorsReady: blockers.length === 0,
    needsUpgrade: router.needsUpgrade,
    mirrorSubscriptionRegistered: contractSubscriptionId !== 0n,
    perpRouter: router.perpRouter,
    mirrorReactor: router.mirrorReactor,
    marginBank: router.marginBank,
    deployBytecode: router.deployBytecode,
    blockers,
  }
}
