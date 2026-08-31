import dotenv from 'dotenv';
dotenv.config({ override: true });

import { type Address, createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  CHAIN_ID, RPC_URL, WS_RPC_URL, EXPLORER_URL,
  VAULT_FACTORY_ADDRESS, LEGACY_VAULT_FACTORY_ADDRESS, EXTRA_VAULT_FACTORY_ADDRESSES, PERFORMANCE_LEDGER_ADDRESS,
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
  legacyVaultFactoryAddress: LEGACY_VAULT_FACTORY_ADDRESS || undefined,
  extraVaultFactoryAddresses: EXTRA_VAULT_FACTORY_ADDRESSES,
  performanceLedgerAddress: PERFORMANCE_LEDGER_ADDRESS || undefined,
  agentRequesterAddress: AGENT_REQUESTER_ADDRESS,
  ethUsdOracle: ETH_USD_ORACLE,
};

/** All vault factory contracts the indexer and deploy resolver should recognize. */
export function getKnownFactoryAddresses(): Address[] {
  const addrs: Address[] = [];
  if (config.vaultFactoryAddress) addrs.push(config.vaultFactoryAddress);
  if (
    config.legacyVaultFactoryAddress &&
    config.legacyVaultFactoryAddress.toLowerCase() !== config.vaultFactoryAddress?.toLowerCase()
  ) {
    addrs.push(config.legacyVaultFactoryAddress);
  }
  for (const extra of config.extraVaultFactoryAddresses ?? []) {
    const lower = extra.toLowerCase();
    if (!addrs.some((a) => a.toLowerCase() === lower)) {
      addrs.push(extra);
    }
  }
  return addrs;
}

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
