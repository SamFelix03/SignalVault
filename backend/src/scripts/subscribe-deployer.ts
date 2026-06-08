/** Subscribe deployer wallet on demo vault. Run: npx tsx src/scripts/subscribe-deployer.ts */
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from '../config/chains';
import { DEMO_VAULT_ADDRESS, RPC_URL } from '../config/constants';

const vaultAbi = parseAbi([
  'function subscribe((uint16,uint256,uint16,uint256,bool)) external payable',
  'function getFollowerConfig(address) view returns ((uint16,uint256,uint16,uint256,bool))',
]);

async function main() {
  const pk = process.env.PRIVATE_KEY!;
  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) });

  const config = await publicClient.readContract({
    address: DEMO_VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'getFollowerConfig',
    args: [account.address],
  }) as { active: boolean };

  if (config.active) {
    console.log('Already subscribed:', account.address);
    return;
  }

  const hash = await walletClient.writeContract({
    address: DEMO_VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'subscribe',
    args: [[1000, parseEther('0.02'), 300, parseUnits('1', 18), true] as const],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Subscribed', account.address, hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
