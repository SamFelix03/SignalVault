import { defineChain } from 'viem'
import { CHAIN_ID, RPC_URL, EXPLORER_URL } from './constants'

export const somniaTestnet = defineChain({
  id: CHAIN_ID,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: EXPLORER_URL },
  },
})
