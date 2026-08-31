import { createPublicClient, decodeEventLog, getAddress, http } from 'viem';
import { somniaTestnet, getKnownFactoryAddresses } from '../src/config/chains.js';
import {
  VaultFactoryABI,
  LegacyVaultDeployedEventABI,
  VAULT_DEPLOYED_TOPIC,
  LEGACY_VAULT_DEPLOYED_TOPIC,
} from '../src/abis/VaultFactory.js';

async function main() {
  const txHash = (process.argv[2] ??
    '0xc41f289a0b79f292534262f53fe867c1d678eed3eb552de5a295af6ac7145e03') as `0x${string}`;

  const client = createPublicClient({
    chain: somniaTestnet,
    transport: http('https://api.infra.testnet.somnia.network/'),
  });

  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const known = new Set(getKnownFactoryAddresses().map((a) => a.toLowerCase()));

  console.log('status', receipt.status);
  console.log('to', receipt.to);
  console.log('logCount', receipt.logs.length);
  console.log('knownFactories', getKnownFactoryAddresses());
  console.log('expected topics', { VAULT_DEPLOYED_TOPIC, LEGACY_VAULT_DEPLOYED_TOPIC });

  for (const [i, log] of receipt.logs.entries()) {
    console.log('--- log', i);
    console.log(' address', log.address, 'known', known.has(log.address.toLowerCase()));
    console.log(' topic0', log.topics[0]);
    console.log(' topics', log.topics.length);
    if (log.topics[0] === VAULT_DEPLOYED_TOPIC || log.topics[0] === LEGACY_VAULT_DEPLOYED_TOPIC) {
      console.log(' MATCHES VaultDeployed topic');
      for (const abi of [VaultFactoryABI, LegacyVaultDeployedEventABI]) {
        try {
          const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
          console.log(' decoded', d);
        } catch (e) {
          console.log(' decode err', e instanceof Error ? e.message : e);
        }
      }
      if (log.topics.length >= 4) {
        console.log(' indexed vaultId', BigInt(log.topics[1]!));
        console.log(' indexed vault', getAddress(log.topics[2]!));
        console.log(' indexed strategist', getAddress(log.topics[3]!));
      }
    }
  }
}

main().catch(console.error);

async function testResolve() {
  const { resolveVaultFromDeployTx } = await import('../src/services/vault-setup-service.js');
  const txHash = '0xc41f289a0b79f292534262f53fe867c1d678eed3eb552de5a295af6ac7145e03' as `0x${string}`;
  try {
    const r = await resolveVaultFromDeployTx(txHash);
    console.log('resolve OK', r);
  } catch (e) {
    console.error('resolve FAIL', e);
  }
}

if (process.argv.includes('--resolve')) {
  void testResolve();
}
