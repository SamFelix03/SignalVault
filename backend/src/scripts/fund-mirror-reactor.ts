/**
 * Funds MirrorReactor with STT for reactivity handler gas.
 * Run: npx tsx src/scripts/fund-mirror-reactor.ts
 */
import { createPublicClient, createWalletClient, http, parseEther, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from '../config/chains';
import { DEMO_MIRROR_REACTOR, RPC_URL } from '../config/constants';
import { vaultIndexer } from '../services/vault-indexer';

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not set');

  await vaultIndexer.start();
  const vaults = vaultIndexer.getAllVaults();
  const mirror = (process.env.DEMO_MIRROR_REACTOR || vaults[vaults.length - 1]?.mirrorReactor || DEMO_MIRROR_REACTOR) as Address;
  const amount = parseEther(process.env.MIRROR_REACTOR_STT || '2');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) });

  console.log('Funding MirrorReactor', mirror, 'with', Number(amount) / 1e18, 'STT');
  const hash = await walletClient.sendTransaction({ to: mirror, value: amount });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Done:', hash);
  vaultIndexer.stop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
