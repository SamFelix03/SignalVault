import { type Address } from 'viem'
import { VaultFactoryABI } from '@/abis/VaultFactory'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import {
  VAULT_FACTORY_ADDRESS,
  DEMO_VAULT_ADDRESS,
  API_URL,
  TESTNET_TUSDC,
  MARKETS_INDEXER_URL,
  MARKETS_WS_RPC,
} from './constants'

export { VAULT_FACTORY_ADDRESS, DEMO_VAULT_ADDRESS, API_URL, TESTNET_TUSDC, MARKETS_INDEXER_URL, MARKETS_WS_RPC }

export const erc20MinimalAbi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

/** Somnia testnet tUSDC — signal fees and Event Contract collateral. */
export const tusdcConfig = {
  address: TESTNET_TUSDC,
  abi: erc20MinimalAbi,
} as const

/** @deprecated Use tusdcConfig — fees and trading both use tUSDC. */
export const paymentTokenConfig = tusdcConfig

export const vaultFactoryConfig = {
  address: VAULT_FACTORY_ADDRESS,
  abi: VaultFactoryABI,
} as const

export function vaultConfig(address: Address) {
  return {
    address,
    abi: StrategyVaultABI,
  } as const
}
