/**
 * Deploys a demo vault via the VaultFactory and registers reactivity subscriptions.
 * Run: npx tsx src/scripts/deploy-demo-vault.ts
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { VAULT_FACTORY_ADDRESS, RPC_URL } from '../config/constants';
import { somniaTestnet } from '../config/chains';

const factoryAbi = parseAbi([
  'function deployVault(string strategyPrompt, uint16 performanceFeeBps, uint256 maxDrawdownBps, uint256 signalPricePerSignal) payable returns (uint256)',
  'function getDeployment(uint256) view returns (address vault, address orchestrator, address mirrorReactor, address stopReactor, address drawdownGuard, address epochCron, address performanceLedger, address feeDistributor, address strategist, uint256 deployedAt)',
  'function getDeploymentCount() view returns (uint256)',
]);

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not set');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: somniaTestnet,
    transport: http(RPC_URL),
  });

  console.log('Deployer:', account.address);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', (Number(balance) / 1e18).toFixed(2), 'STT');

  const strategyPrompt = process.env.STRATEGY_PROMPT ||
    'ETH momentum strategy with fear/greed overlay. Go long when ETH shows upward momentum and Fear & Greed < 30 (extreme fear = buy opportunity). Go short when momentum is negative and Fear & Greed > 75 (extreme greed = sell signal). Use 15-25% position sizing. Set stops at 3% from entry.';

  const feeBps = parseInt(process.env.FEE_BPS || '1000'); // 10% default
  const maxDrawdownBps = BigInt(process.env.MAX_DRAWDOWN_BPS || '2000'); // 20% default
  const fundingAmount = parseEther(process.env.FUNDING_STT || '2'); // 2 STT for agent pipeline

  const signalPricePerSignal = parseEther(process.env.SIGNAL_PRICE_SVT || '0');

  console.log('\nDeploying vault via factory:', VAULT_FACTORY_ADDRESS);
  console.log('\nDeploying vault...');
  console.log('  Strategy:', strategyPrompt.slice(0, 80) + '...');
  console.log('  Fee:', feeBps / 100, '%');
  console.log('  Max Drawdown:', Number(maxDrawdownBps) / 100, '%');
  console.log('  Funding:', (Number(fundingAmount) / 1e18).toFixed(2), 'STT');
  console.log('  Signal price:', process.env.SIGNAL_PRICE_SVT || '0', 'SVT');

  const hash = await walletClient.writeContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'deployVault',
    args: [strategyPrompt, feeBps, maxDrawdownBps, signalPricePerSignal],
    value: fundingAmount,
  });

  console.log('  Tx hash:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('  Status:', receipt.status);

  // Get the new deployment
  const count = await publicClient.readContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getDeploymentCount',
  });

  const vaultId = count - 1n;
  const dep = await publicClient.readContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getDeployment',
    args: [vaultId],
  });

  const [vault, orchestrator, mirrorReactor, stopReactor, drawdownGuard, epochCron, performanceLedger, feeDistributor, strategist] = dep;

  console.log('\n=== VAULT DEPLOYED ===');
  console.log('Vault ID:', vaultId.toString());
  console.log('Vault:', vault);
  console.log('Orchestrator:', orchestrator);
  console.log('MirrorReactor:', mirrorReactor);
  console.log('StopReactor:', stopReactor);
  console.log('DrawdownGuard:', drawdownGuard);
  console.log('EpochCron:', epochCron);
  console.log('PerformanceLedger:', performanceLedger);
  console.log('FeeDistributor:', feeDistributor);
  console.log('Strategist:', strategist);

  // Wire MirrorReactor -> PerformanceLedger authorization
  console.log('\nAuthorizing MirrorReactor on PerformanceLedger...');
  const ledgerAbi = parseAbi(['function addAuthorizedCaller(address) external']);
  const authHash = await walletClient.writeContract({
    address: performanceLedger,
    abi: ledgerAbi,
    functionName: 'addAuthorizedCaller',
    args: [mirrorReactor],
  });
  await publicClient.waitForTransactionReceipt({ hash: authHash });
  console.log('  ✓ MirrorReactor authorized');

  // Wire MirrorReactor -> PerformanceLedger reference
  console.log('Setting PerformanceLedger on MirrorReactor...');
  const mirrorAbi = parseAbi(['function setPerformanceLedger(address) external']);
  const ledgerRefHash = await walletClient.writeContract({
    address: mirrorReactor,
    abi: mirrorAbi,
    functionName: 'setPerformanceLedger',
    args: [performanceLedger],
  });
  await publicClient.waitForTransactionReceipt({ hash: ledgerRefHash });
  console.log('  ✓ PerformanceLedger set on MirrorReactor');

  console.log('\n=== NEXT STEPS ===');
  console.log('1. Update frontend/src/lib/constants.ts and backend/.env with new addresses');
  console.log('2. Run: npx tsx src/scripts/register-subscriptions.ts');
  console.log('3. npx tsx src/scripts/fund-epoch-cron.ts');
  console.log('4. npx tsx src/scripts/subscribe-deployer.ts');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
