import dotenv from 'dotenv';
dotenv.config({ override: true });

import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  CHAIN_ID, RPC_URL, WS_RPC_URL, EXPLORER_URL,
  VAULT_FACTORY_ADDRESS, PERFORMANCE_LEDGER_ADDRESS,
  AGENT_REQUESTER_ADDRESS, ETH_USD_ORACLE,
} from './constants';

export const somniaTestnet = defineChain({
  id: CHAIN_ID,
  name: 'Somnia Testnet',
  network: 'somnia-testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Shannon Explorer', url: EXPLORER_URL },
  },
} as const);

export const config = {
  rpcUrl: RPC_URL,
  wsRpcUrl: WS_RPC_URL,
  chainId: CHAIN_ID,
  vaultFactoryAddress: VAULT_FACTORY_ADDRESS || undefined,
  performanceLedgerAddress: PERFORMANCE_LEDGER_ADDRESS || undefined,
  agentRequesterAddress: AGENT_REQUESTER_ADDRESS,
  ethUsdOracle: ETH_USD_ORACLE,
};

export const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(RPC_URL),
});

export function getWalletClient() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({
    account,
    chain: somniaTestnet,
    transport: http(RPC_URL),
  });
}

export function getAccount() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }
  return privateKeyToAccount(pk as `0x${string}`);
}
