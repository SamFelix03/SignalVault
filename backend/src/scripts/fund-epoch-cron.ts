/**
 * Funds the demo vault's EpochCron with STT for automated pipeline triggers.
 * Run: npx tsx src/scripts/fund-epoch-cron.ts
 */
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from '../config/chains';
import { RPC_URL } from '../config/constants';
import { vaultIndexer } from '../services/vault-indexer';

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not set');

  await vaultIndexer.start();
  const vaults = vaultIndexer.getAllVaults();
  if (vaults.length === 0) throw new Error('No vaults indexed — set VAULT_FACTORY_ADDRESS and restart');

  const vault = vaults[vaults.length - 1];
  const amount = parseEther(process.env.EPOCH_CRON_STT || '0.5');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) });

  console.log('Funding EpochCron', vault.epochCron, 'with', Number(amount) / 1e18, 'STT');
  const hash = await walletClient.sendTransaction({
    to: vault.epochCron,
    value: amount,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Done:', hash);
  vaultIndexer.stop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
