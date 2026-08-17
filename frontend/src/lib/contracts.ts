import { type Address } from 'viem'
import { VaultFactoryABI } from '@/abis/VaultFactory'
import { StrategyVaultABI } from '@/abis/StrategyVault'
import { SignalPayTokenABI } from '@/abis/SignalPayToken'
import { VAULT_FACTORY_ADDRESS, DEMO_VAULT_ADDRESS, API_URL, PAYMENT_TOKEN_ADDRESS } from './constants'

export { VAULT_FACTORY_ADDRESS, DEMO_VAULT_ADDRESS, API_URL, PAYMENT_TOKEN_ADDRESS }

export const paymentTokenConfig = PAYMENT_TOKEN_ADDRESS
  ? { address: PAYMENT_TOKEN_ADDRESS, abi: SignalPayTokenABI } as const
  : null

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
