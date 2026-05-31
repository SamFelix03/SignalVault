import { type Address } from 'viem'
import { VaultFactoryABI } from '@/abis/VaultFactory'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import { VAULT_FACTORY_ADDRESS, DEMO_VAULT_ADDRESS, API_URL } from './constants'

export { VAULT_FACTORY_ADDRESS, DEMO_VAULT_ADDRESS, API_URL }

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
