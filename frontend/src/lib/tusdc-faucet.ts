import { parseAbi } from 'viem'
import { TESTNET_TUSDC, TUSDC_DECIMALS } from './constants'

/** Somnia Markets testnet tUSDC — on-chain faucet, 10k max per call. */
export const TUSDC_FAUCET_CAP = 10_000n * 10n ** BigInt(TUSDC_DECIMALS)

export const tusdcFaucetAbi = parseAbi(['function faucet(uint256 amount)'])

export const tusdcFaucetConfig = {
  address: TESTNET_TUSDC,
  abi: tusdcFaucetAbi,
} as const

export const STT_FAUCET_URL = 'https://testnet.somnia.network/'
