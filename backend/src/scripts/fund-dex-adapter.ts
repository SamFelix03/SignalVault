/**
 * Funds DreamDexAdapter with USDso (longs) and optionally WETH (shorts) for mirror IOC orders.
 * Run: npx tsx src/scripts/fund-dex-adapter.ts
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from '../config/chains';
import { DEMO_MIRROR_REACTOR, RPC_URL } from '../config/constants';
import { vaultIndexer } from '../services/vault-indexer';

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

const mirrorAbi = parseAbi(['function dex() view returns (address)']);
const adapterAbi = parseAbi([
  'function depositQuote(uint256 amount) external',
  'function depositBase(uint256 amount) external',
  'function quoteToken() view returns (address)',
  'function baseToken() view returns (address)',
]);

async function depositToken(
  walletClient: Awaited<ReturnType<typeof createWalletClient>>,
  publicClient: Awaited<ReturnType<typeof createPublicClient>>,
  token: Address,
  adapter: Address,
  amount: bigint,
  kind: 'quote' | 'base',
): Promise<void> {
  const symbol = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' });
  const balance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [walletClient.account!.address] });
  console.log(`  ${symbol} balance:`, balance.toString());
  if (balance < amount) {
    console.warn(`  Skipping ${symbol} deposit — insufficient balance (need ${amount.toString()})`);
    return;
  }

  const approveHash = await walletClient.writeContract({
    chain: somniaTestnet,
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [adapter, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const depositHash = await walletClient.writeContract({
    chain: somniaTestnet,
    address: adapter,
    abi: adapterAbi,
    functionName: kind === 'quote' ? 'depositQuote' : 'depositBase',
    args: [amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositHash });
  console.log(`  ✓ Deposited ${amount.toString()} ${symbol} (${kind})`);
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not set');

  await vaultIndexer.start();
  const vaults = vaultIndexer.getAllVaults();
  const mirror = (process.env.DEMO_MIRROR_REACTOR || vaults[vaults.length - 1]?.mirrorReactor || DEMO_MIRROR_REACTOR) as Address;

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) });

  const adapter = await publicClient.readContract({
    address: mirror,
    abi: mirrorAbi,
    functionName: 'dex',
  }) as Address;

  const [quoteToken, baseToken] = await Promise.all([
    publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: 'quoteToken' }),
    publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: 'baseToken' }),
  ]) as [Address, Address];

  console.log('MirrorReactor:', mirror);
  console.log('DreamDexAdapter:', adapter);
  console.log('Quote token (USDso):', quoteToken);
  console.log('Base token (WETH):', baseToken);

  const quoteAmount = parseUnits(process.env.DEX_QUOTE_USDSO || '50', 18);
  const baseAmount = process.env.DEX_BASE_WETH === '0'
    ? 0n
    : parseUnits(process.env.DEX_BASE_WETH || '0.01', 18);

  console.log('\nDepositing to dreamDEX pool vault via adapter...');
  if (quoteAmount > 0n) {
    await depositToken(walletClient, publicClient, quoteToken, adapter, quoteAmount, 'quote');
  }
  if (baseAmount > 0n) {
    await depositToken(walletClient, publicClient, baseToken, adapter, baseAmount, 'base');
  }

  vaultIndexer.stop();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
